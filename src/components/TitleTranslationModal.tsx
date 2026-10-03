import React, { useState, useEffect, useMemo } from 'react';
import { WorkItem, TrackItem, FlatTrack } from '../types/asmr';
import { getWorkTracks, flattenTrackTree, translateBatchTitles } from '../services/api';
import {
  getStoredGeminiApiKey,
  setStoredGeminiApiKey,
  executeTitleTranslationWorkflow,
  checkServerCachedTitles,
  sanitizeErrorMessage,
} from '../services/clientGeminiTranslator';
import {
  getCachedTitle,
  hasCachedTitle,
  setCachedTitles,
  clearCachedTitles,
  getTitleCacheStats,
  setStoredDisplayMode,
  getStoredDisplayMode,
  TranslationTargetLang,
  TitleDisplayMode,
} from '../services/titleTranslationCache';
import { GeminiApiKeyPromptModal } from './GeminiApiKeyPromptModal';
import {
  X,
  Languages,
  Sparkles,
  Check,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
  Folder,
  FileAudio,
  FileText,
  File,
  Copy,
  Download,
  Trash2,
  RefreshCw,
  Eye,
  CheckCircle2,
  Zap,
  Info,
  Layers,
  ArrowRight,
} from 'lucide-react';

export interface TitleTranslationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialWork?: WorkItem | null;
  availableWorks?: WorkItem[];
  onApplyLanguageMode?: (mode: TitleDisplayMode) => void;
}

interface SelectedWorkState {
  work: WorkItem;
  includeTitle: boolean;
  selectedTrackPaths: Set<string>;
  tracks: TrackItem[];
  loadingTracks: boolean;
  expanded: boolean;
}

export const TitleTranslationModal: React.FC<TitleTranslationModalProps> = ({
  isOpen,
  onClose,
  initialWork,
  availableWorks = [],
  onApplyLanguageMode,
}) => {
  const [targetLang, setTargetLang] = useState<TranslationTargetLang>('en');
  const [workStates, setWorkStates] = useState<Map<number, SelectedWorkState>>(new Map());
  const [customText, setCustomText] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'selection' | 'custom' | 'results' | 'cache'>('selection');
  
  // Gemini API Key state (Required for client-side translation)
  const [geminiApiKey, setGeminiApiKey] = useState<string>(getStoredGeminiApiKey());
  const [showKeyInput, setShowKeyInput] = useState<boolean>(!getStoredGeminiApiKey());
  const [isPromptModalOpen, setIsPromptModalOpen] = useState<boolean>(false);

  // Translation progress state
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [lastResults, setLastResults] = useState<Record<string, string>>({});
  const [lastEngine, setLastEngine] = useState<string>('');
  const [cacheStats, setCacheStats] = useState(getTitleCacheStats());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Initialize works list when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setCacheStats(getTitleCacheStats());
    const initialMap = new Map<number, SelectedWorkState>();

    // If a specific work is passed, prioritize it
    const candidateWorks: WorkItem[] = [];
    if (initialWork) candidateWorks.push(initialWork);
    for (const w of availableWorks) {
      if (!candidateWorks.some((cw) => cw.id === w.id)) {
        candidateWorks.push(w);
      }
    }

    for (const work of candidateWorks) {
      initialMap.set(work.id, {
        work,
        includeTitle: true,
        selectedTrackPaths: new Set(),
        tracks: [],
        loadingTracks: false,
        expanded: initialWork ? work.id === initialWork.id : candidateWorks.length === 1,
      });
    }

    setWorkStates(initialMap);

    // If initialWork is present, auto-load its tracks
    if (initialWork) {
      loadTracksForWork(initialWork.id);
    }
  }, [isOpen, initialWork, availableWorks]);

  const loadTracksForWork = async (workId: number) => {
    const current = workStates.get(workId);
    if (current && current.tracks.length > 0) return;

    setWorkStates((prev) => {
      const next = new Map(prev);
      const item = next.get(workId);
      if (item) next.set(workId, { ...item, loadingTracks: true });
      return next;
    });

    try {
      const tracks = await getWorkTracks(workId);
      const flattened = flattenTrackTree(tracks, workId);
      const allPaths = new Set(flattened.map((t) => t.path));

      setWorkStates((prev) => {
        const next = new Map(prev);
        const item = next.get(workId);
        if (item) {
          next.set(workId, {
            ...item,
            tracks,
            loadingTracks: false,
            selectedTrackPaths: allPaths, // default select all tracks
          });
        }
        return next;
      });
    } catch (err) {
      console.error(`Failed to load tracks for work ${workId}:`, err);
      setWorkStates((prev) => {
        const next = new Map(prev);
        const item = next.get(workId);
        if (item) next.set(workId, { ...item, loadingTracks: false });
        return next;
      });
    }
  };

  // Toggle expand/collapse of work
  const handleToggleExpand = (workId: number) => {
    const item = workStates.get(workId);
    if (!item) return;

    if (!item.expanded && item.tracks.length === 0) {
      loadTracksForWork(workId);
    }

    setWorkStates((prev) => {
      const next = new Map(prev);
      const current = next.get(workId);
      if (current) {
        next.set(workId, { ...current, expanded: !current.expanded });
      }
      return next;
    });
  };

  // Toggle work title selection
  const handleToggleTitle = (workId: number) => {
    setWorkStates((prev) => {
      const next = new Map(prev);
      const current = next.get(workId);
      if (current) {
        next.set(workId, { ...current, includeTitle: !current.includeTitle });
      }
      return next;
    });
  };

  // Toggle specific track selection
  const handleToggleTrack = (workId: number, trackPath: string) => {
    setWorkStates((prev) => {
      const next = new Map(prev);
      const current = next.get(workId);
      if (current) {
        const newSet = new Set(current.selectedTrackPaths);
        if (newSet.has(trackPath)) {
          newSet.delete(trackPath);
        } else {
          newSet.add(trackPath);
        }
        next.set(workId, { ...current, selectedTrackPaths: newSet });
      }
      return next;
    });
  };

  // Select all tracks for work
  const handleSelectAllTracksForWork = (workId: number, selectAll: boolean) => {
    const current = workStates.get(workId);
    if (!current) return;
    const flattened = flattenTrackTree(current.tracks, workId);

    setWorkStates((prev) => {
      const next = new Map(prev);
      const item = next.get(workId);
      if (item) {
        const newSet = selectAll ? new Set(flattened.map((t) => t.path)) : new Set<string>();
        next.set(workId, { ...item, selectedTrackPaths: newSet, includeTitle: selectAll });
      }
      return next;
    });
  };

  // Select audio tracks only for work
  const handleSelectAudioOnlyForWork = (workId: number) => {
    const current = workStates.get(workId);
    if (!current) return;
    const flattened = flattenTrackTree(current.tracks, workId);
    const audioPaths = flattened.filter((t) => t.type === 'audio').map((t) => t.path);

    setWorkStates((prev) => {
      const next = new Map(prev);
      const item = next.get(workId);
      if (item) {
        next.set(workId, { ...item, selectedTrackPaths: new Set(audioPaths), includeTitle: true });
      }
      return next;
    });
  };

  // Global selection helpers
  const handleSelectAllWorks = (select: boolean) => {
    setWorkStates((prev) => {
      const next = new Map(prev);
      for (const [id, item] of next.entries()) {
        const flattened = flattenTrackTree(item.tracks, id);
        next.set(id, {
          ...item,
          includeTitle: select,
          selectedTrackPaths: select ? new Set(flattened.map((t) => t.path)) : new Set(),
        });
      }
      return next;
    });
  };

  // Compute total selected items count
  const selectedSummary = useMemo(() => {
    let titleCount = 0;
    let trackCount = 0;
    const allUniqueTexts: string[] = [];

    for (const item of workStates.values()) {
      if (item.includeTitle && item.work.title) {
        titleCount++;
        if (!allUniqueTexts.includes(item.work.title)) {
          allUniqueTexts.push(item.work.title);
        }
      }
      if (item.selectedTrackPaths.size > 0) {
        const flattened = flattenTrackTree(item.tracks, item.work.id);
        for (const track of flattened) {
          if (item.selectedTrackPaths.has(track.path)) {
            trackCount++;
            if (track.title && !allUniqueTexts.includes(track.title)) {
              allUniqueTexts.push(track.title);
            }
          }
        }
      }
    }

    if (customText.trim()) {
      const lines = customText.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (!allUniqueTexts.includes(line)) {
          allUniqueTexts.push(line);
        }
      }
    }

    let alreadyCachedCount = 0;
    for (const text of allUniqueTexts) {
      if (hasCachedTitle(text, targetLang)) {
        alreadyCachedCount++;
      }
    }

    return {
      titleCount,
      trackCount,
      totalItems: allUniqueTexts.length,
      allUniqueTexts,
      alreadyCachedCount,
      needsApiCount: allUniqueTexts.length - alreadyCachedCount,
    };
  }, [workStates, customText, targetLang]);

  const runTranslation = async (keyToUse: string) => {
    if (selectedSummary.totalItems === 0) return;
    const cleanKey = keyToUse.trim();
    if (!cleanKey) {
      setIsPromptModalOpen(true);
      return;
    }

    setStoredGeminiApiKey(cleanKey);
    setGeminiApiKey(cleanKey);
    setIsTranslating(true);
    setProgressStatus(`Translating ${selectedSummary.totalItems} item(s) client-side with Google Gemini...`);

    // Prepare workInfo if this translation is for a specific work
    const workToRecord = initialWork || (workStates.size > 0 ? Array.from(workStates.values())[0]?.work : undefined);
    const workInfo = workToRecord ? {
      id: workToRecord.id,
      rjCode: workToRecord.source_id || `RJ${workToRecord.id}`,
      originalTitle: workToRecord.title,
      coverUrl: workToRecord.thumbnailCoverUrl || workToRecord.mainCoverUrl || '',
      circle: workToRecord.name || '',
      vas: (workToRecord.vas || []).map((v) => v.name).join(', '),
      totalTracks: selectedSummary.trackCount || 0,
    } : undefined;

    try {
      const response = await executeTitleTranslationWorkflow(selectedSummary.allUniqueTexts, targetLang, cleanKey, workInfo);
      
      // Save results to local storage cache
      setCachedTitles(response.translations, targetLang);
      setLastResults(response.translations);
      setLastEngine(response.engine);
      setCacheStats(getTitleCacheStats());

      if (response.skipped) {
        setProgressStatus(
          `✓ Work title and tracks are already translated in ${
            targetLang === 'vi' ? 'Tiếng Việt' : 'English'
          }. Skipped translation (no API calls used).`
        );
      } else {
        setProgressStatus(
          `Successfully translated ${Object.keys(response.translations).length} item(s) to ${
            targetLang === 'vi' ? 'Tiếng Việt' : 'English'
          } and permanently saved to server vault!`
        );
      }
      setActiveTab('results');
    } catch (err: any) {
      console.error('Translation error:', err);
      if (err.message === 'GEMINI_KEY_REQUIRED' || err.message?.includes('API_KEY')) {
        setIsPromptModalOpen(true);
        setProgressStatus('Please enter a valid Google Gemini API Key.');
      } else {
        setProgressStatus(`Translation failed: ${sanitizeErrorMessage(err.message || 'Gemini API error')}`);
      }
    } finally {
      setIsTranslating(false);
    }
  };

  // Execute Translation Action
  const handleExecuteTranslation = async () => {
    if (selectedSummary.totalItems === 0) return;

    // CHECK: If all selected items are already translated locally, skip API translation completely!
    if (selectedSummary.needsApiCount === 0) {
      const results: Record<string, string> = {};
      for (const text of selectedSummary.allUniqueTexts) {
        const cached = getCachedTitle(text, targetLang);
        if (cached) results[text] = cached;
      }
      setLastResults(results);
      setProgressStatus(
        `✓ All ${selectedSummary.totalItems} selected item(s) are already translated in ${
          targetLang === 'vi' ? 'Tiếng Việt' : 'English'
        }. Skipped translation (no API calls used).`
      );
      setActiveTab('results');
      return;
    }

    // CHECK: Verify server cache for already translated titles before asking for API key
    try {
      const serverCheck = await checkServerCachedTitles(selectedSummary.allUniqueTexts, targetLang);
      if (serverCheck.cached && Object.keys(serverCheck.cached).length > 0) {
        setCachedTitles(serverCheck.cached, targetLang);
      }

      if (serverCheck.missing.length === 0) {
        setLastResults(serverCheck.cached);
        setProgressStatus(
          `✓ All ${selectedSummary.totalItems} item(s) are already translated on server in ${
            targetLang === 'vi' ? 'Tiếng Việt' : 'English'
          }. Skipped translation (no API calls used).`
        );
        setActiveTab('results');
        return;
      }
    } catch (err) {
      console.warn('Server cache check error:', err);
    }

    const trimmedKey = geminiApiKey.trim();
    if (!trimmedKey) {
      setIsPromptModalOpen(true);
      setProgressStatus('Google Gemini API Key is required to translate titles and tracks.');
      return;
    }

    await runTranslation(trimmedKey);
  };

  // Apply language mode app-wide
  const handleApplyMode = (mode: TitleDisplayMode) => {
    setStoredDisplayMode(mode);
    if (onApplyLanguageMode) {
      onApplyLanguageMode(mode);
    }
  };

  // Copy helper
  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Download translated tracklist
  const handleDownloadTracklist = (work: WorkItem, tracks: TrackItem[]) => {
    const flattened = flattenTrackTree(tracks, work.id);
    const translatedWorkTitle = getCachedTitle(work.title, targetLang) || work.title;

    let content = `# ASMR Work: ${translatedWorkTitle} (${work.source_id || `RJ${work.id}`})\n`;
    content += `# Language: ${targetLang === 'vi' ? 'Tiếng Việt (Vietnamese)' : 'English'}\n`;
    content += `# Generated on: ${new Date().toLocaleString()}\n\n`;

    content += `=== ORIGINAL TITLE ===\n${work.title}\n\n`;
    content += `=== TRANSLATED TITLE ===\n${translatedWorkTitle}\n\n`;
    content += `=== TRACKLIST ===\n`;

    flattened.forEach((t, idx) => {
      const translatedTrack = getCachedTitle(t.title, targetLang) || t.title;
      content += `${idx + 1}. [${t.type.toUpperCase()}] ${translatedTrack} (Orig: ${t.title})\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${work.source_id || `RJ${work.id}`}_translated_${targetLang}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/90 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600 to-rose-600 text-white shadow-md">
                <Languages className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span>Manual Title &amp; Track Translation</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Gemini 3.8 + Persistent Cache
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Select which works and track titles to translate into English or Tiếng Việt.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Language Selector & Tabs */}
        <div className="px-4 sm:px-6 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          {/* Target Language Radio Switch */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">Target Language:</span>
            <div className="inline-flex rounded-xl p-1 bg-slate-800/90 border border-slate-700">
              <button
                type="button"
                onClick={() => setTargetLang('en')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  targetLang === 'en'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🇬🇧</span>
                <span>English</span>
                {cacheStats.enCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-900/60 text-blue-200">
                    {cacheStats.enCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setTargetLang('vi')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  targetLang === 'vi'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🇻🇳</span>
                <span>Tiếng Việt</span>
                {cacheStats.viCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-red-900/60 text-red-200">
                    {cacheStats.viCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('selection')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'selection'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Select Works &amp; Tracks ({workStates.size})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'custom'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Custom Text Input</span>
            </button>

            {Object.keys(lastResults).length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('results')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'results'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Results</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('cache')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'cache'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Cache Vault ({cacheStats.total})</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* GEMINI API KEY REQUIRED PROMPT BANNER */}
          <div className="rounded-xl border p-3.5 text-xs bg-slate-900/90 border-slate-700/80">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${geminiApiKey.trim() ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className="font-bold text-white">Google Gemini API Key (Required for Title &amp; Track Translation)</span>
                  {geminiApiKey.trim() ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Key Active ({geminiApiKey.trim().slice(0, 6)}...{geminiApiKey.trim().slice(-4)})
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Key Required
                    </span>
                  )}
                </div>
                <p className="text-slate-400 text-[11px]">
                  Translations are executed directly in your browser with your Gemini key and uploaded to the server cache for everyone.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowKeyInput((prev) => !prev)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-[11px] border border-slate-700 transition cursor-pointer"
              >
                {showKeyInput ? 'Hide Key Form' : geminiApiKey.trim() ? 'Change Key' : 'Enter API Key'}
              </button>
            </div>

            {showKeyInput && (
              <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center gap-2 flex-wrap">
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="Paste your Gemini API Key (AIzaSy...)"
                  className="flex-1 min-w-[240px] px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    const clean = geminiApiKey.trim();
                    setStoredGeminiApiKey(clean);
                    setShowKeyInput(!clean);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition cursor-pointer shadow-sm"
                >
                  Save Key
                </button>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-blue-400 hover:text-blue-300 underline inline-flex items-center gap-1 ml-auto"
                >
                  Get free Gemini API Key at Google AI Studio &rarr;
                </a>
              </div>
            )}
          </div>
          {/* TAB 1: WORK & TRACK SELECTION */}
          {activeTab === 'selection' && (
            <div className="space-y-4">
              {/* Top Action Bar */}
              <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-3 flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectAllWorks(true)}
                    className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium transition cursor-pointer"
                  >
                    Select All Works
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectAllWorks(false)}
                    className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium transition cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>

                <div className="flex items-center gap-3 text-slate-300">
                  <span>Selected: <strong className="text-white">{selectedSummary.titleCount} Titles</strong> + <strong className="text-white">{selectedSummary.trackCount} Tracks</strong></span>
                  {selectedSummary.alreadyCachedCount > 0 && (
                    <span className="text-amber-400 flex items-center gap-1 font-semibold">
                      <Zap className="w-3 h-3" /> {selectedSummary.alreadyCachedCount} already cached!
                    </span>
                  )}
                </div>
              </div>

              {/* Works List */}
              {workStates.size === 0 ? (
                <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-slate-800 text-slate-400 text-xs">
                  No works loaded yet. Search for ASMR works or open a work card to translate its title and tracks.
                </div>
              ) : (
                <div className="space-y-3">
                  {Array.from(workStates.values()).map((item) => {
                    const work = item.work;
                    const rjCode = work.source_id || `RJ${work.id}`;
                    const cachedWorkTitle = getCachedTitle(work.title, targetLang);
                    const flattened = flattenTrackTree(item.tracks, work.id);
                    const allTracksCount = flattened.length;
                    const isAllTracksSelected = allTracksCount > 0 && item.selectedTrackPaths.size === allTracksCount;

                    return (
                      <div
                        key={work.id}
                        className="bg-slate-800/40 border border-slate-700/70 rounded-xl overflow-hidden transition"
                      >
                        {/* Work Header Row */}
                        <div className="p-3 bg-slate-800/70 flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            {/* Checkbox for Work Title */}
                            <button
                              type="button"
                              onClick={() => handleToggleTitle(work.id)}
                              className="p-1 rounded hover:bg-slate-700 text-slate-300 cursor-pointer shrink-0"
                              title="Toggle title translation"
                            >
                              {item.includeTitle ? (
                                <CheckSquare className="w-4 h-4 text-indigo-400" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-500" />
                              )}
                            </button>

                            <span className="px-1.5 py-0.5 rounded bg-red-600 font-extrabold text-white text-[10px]">
                              {rjCode}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-100 text-xs truncate" title={work.title}>
                                  {work.title}
                                </span>
                              </div>

                              {cachedWorkTitle && (
                                <div className="text-[11px] text-indigo-300 flex items-center gap-1 mt-0.5 truncate font-medium">
                                  <Zap className="w-3 h-3 text-amber-400 shrink-0" />
                                  <span className="truncate">
                                    [{targetLang.toUpperCase()}]: {cachedWorkTitle}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons & Expand */}
                          <div className="flex items-center gap-2 shrink-0">
                            {cachedWorkTitle && (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-semibold">
                                <Zap className="w-3 h-3" /> Cached
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => handleToggleExpand(work.id)}
                              className="px-2 py-1 bg-slate-700/80 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition"
                            >
                              <span>Tracks ({item.selectedTrackPaths.size}/{allTracksCount || '?'})</span>
                              {item.expanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Expandable Tracks Section */}
                        {item.expanded && (
                          <div className="p-3 border-t border-slate-700/50 bg-slate-900/60 space-y-2.5">
                            {/* Tracks Quick Selector Toolbar */}
                            <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] text-slate-400 border-b border-slate-800 pb-2">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-300">Quick Track Select:</span>
                                <button
                                  type="button"
                                  onClick={() => handleSelectAllTracksForWork(work.id, true)}
                                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
                                >
                                  All ({allTracksCount})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSelectAudioOnlyForWork(work.id)}
                                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 cursor-pointer"
                                >
                                  Audio Only
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSelectAllTracksForWork(work.id, false)}
                                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 cursor-pointer"
                                >
                                  None
                                </button>
                              </div>

                              {item.tracks.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleDownloadTracklist(work, item.tracks)}
                                  className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold cursor-pointer"
                                  title="Export translated tracklist to TXT"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>Export List</span>
                                </button>
                              )}
                            </div>

                            {/* Track Items List */}
                            {item.loadingTracks ? (
                              <div className="flex items-center justify-center py-6 text-slate-400 text-xs gap-2">
                                <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                <span>Loading tracks from API...</span>
                              </div>
                            ) : flattened.length === 0 ? (
                              <p className="text-[11px] text-slate-500 py-2 text-center">
                                No tracks found or unable to fetch track hierarchy.
                              </p>
                            ) : (
                              <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                                {flattened.map((t) => {
                                  const isSelected = item.selectedTrackPaths.has(t.path);
                                  const cachedTrack = getCachedTitle(t.title, targetLang);
                                  const isAudio = t.type === 'audio';

                                  return (
                                    <div
                                      key={t.path}
                                      onClick={() => handleToggleTrack(work.id, t.path)}
                                      className={`flex items-center justify-between p-1.5 rounded-lg text-xs cursor-pointer transition select-none ${
                                        isSelected
                                          ? 'bg-slate-800/90 text-slate-200 border border-slate-700/60'
                                          : 'hover:bg-slate-800/40 text-slate-400'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 truncate mr-2 flex-1">
                                        {isSelected ? (
                                          <CheckSquare className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                        ) : (
                                          <Square className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                                        )}

                                        {isAudio ? (
                                          <FileAudio className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                        ) : (
                                          <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                        )}

                                        <span className="truncate font-medium" title={t.title}>
                                          {t.title}
                                        </span>

                                        {cachedTrack && (
                                          <span className="text-[10px] text-emerald-400 font-medium truncate shrink-0 ml-1">
                                            &rarr; {cachedTrack}
                                          </span>
                                        )}
                                      </div>

                                      {cachedTrack ? (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold shrink-0">
                                          ⚡ Cached
                                        </span>
                                      ) : (
                                        <span className="text-[9px] text-slate-500 shrink-0">
                                          Ready
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CUSTOM TEXT INPUT */}
          {activeTab === 'custom' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-300">
                Paste any Japanese ASMR titles, track names, or chapter headings below (one per line) to translate and cache them:
              </div>

              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="01. オープニング〜雨の降る夜に&#10;02. 優しい耳かき（右耳）&#10;03. 囁きと密着マッサージ&#10;【ASMR/添い寝】幼馴染の癒やしボイス"
                rows={8}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 leading-relaxed"
              />

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  Lines to translate:{' '}
                  <strong className="text-white">
                    {customText.split('\n').filter((l) => l.trim()).length}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => setCustomText('')}
                  className="text-red-400 hover:text-red-300 cursor-pointer"
                >
                  Clear input
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: TRANSLATION RESULTS */}
          {activeTab === 'results' && (
            <div className="space-y-4">
              <div className="bg-emerald-950/40 border border-emerald-800/80 rounded-xl p-3 flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-300 font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Translation complete for {Object.keys(lastResults).length} items</span>
                  {lastEngine && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/60 font-mono text-emerald-200">
                      Engine: {lastEngine}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleApplyMode(targetLang)}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs flex items-center gap-1 shadow cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Apply {targetLang === 'vi' ? 'Tiếng Việt' : 'English'} to App</span>
                  </button>
                </div>
              </div>

              {/* Table of Translations */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/80 text-slate-300 font-semibold border-b border-slate-700">
                    <tr>
                      <th className="p-2.5">Original Source Title</th>
                      <th className="p-2.5">
                        Translated ({targetLang === 'vi' ? '🇻🇳 Tiếng Việt' : '🇬🇧 English'})
                      </th>
                      <th className="p-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {Object.entries(lastResults).map(([orig, trans], idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="p-2.5 font-medium text-slate-200 max-w-xs truncate" title={orig}>
                          {orig}
                        </td>
                        <td className="p-2.5 text-indigo-300 font-semibold max-w-xs truncate" title={trans}>
                          {trans}
                        </td>
                        <td className="p-2.5 text-right shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopyText(trans, `trans_${idx}`)}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                            title="Copy translation"
                          >
                            {copiedKey === `trans_${idx}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: CACHE VAULT & MANAGEMENT */}
          {activeTab === 'cache' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-3 text-center space-y-1">
                  <div className="text-2xl font-black text-white">{cacheStats.total}</div>
                  <div className="text-xs text-slate-400">Total Cached Translations</div>
                </div>

                <div className="bg-blue-950/40 border border-blue-800/60 rounded-xl p-3 text-center space-y-1">
                  <div className="text-2xl font-black text-blue-300">{cacheStats.enCount}</div>
                  <div className="text-xs text-blue-200">🇬🇧 English Titles</div>
                </div>

                <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-3 text-center space-y-1">
                  <div className="text-2xl font-black text-red-300">{cacheStats.viCount}</div>
                  <div className="text-xs text-red-200">🇻🇳 Tiếng Việt Titles</div>
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3 text-xs text-slate-300">
                <div className="flex items-center gap-2 font-bold text-white">
                  <Info className="w-4 h-4 text-indigo-400" />
                  <span>How Title Translation Caching Works:</span>
                </div>
                <p className="leading-relaxed text-slate-400">
                  Every work title, track name, and chapter title you translate is safely preserved in browser local storage and server-side memory. When browsing the app or re-opening detail views, cached titles display instantly with 0ms network latency.
                </p>

                <div className="pt-2 flex items-center justify-between border-t border-slate-800 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-300">Active App Display:</span>
                    <button
                      type="button"
                      onClick={() => handleApplyMode('original')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                        getStoredDisplayMode() === 'original'
                          ? 'bg-slate-700 text-white border border-slate-600'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Original
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyMode('en')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                        getStoredDisplayMode() === 'en'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🇬🇧 English
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyMode('vi')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                        getStoredDisplayMode() === 'vi'
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🇻🇳 Tiếng Việt
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Are you sure you want to clear all cached title translations?')) {
                        clearCachedTitles();
                        setCacheStats(getTitleCacheStats());
                        setLastResults({});
                      }
                    }}
                    className="px-3 py-1 bg-red-900/60 hover:bg-red-800 text-red-200 rounded text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Title Cache</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Primary Translate Trigger */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/95 flex items-center justify-between flex-wrap gap-3">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            {progressStatus ? (
              <span className="text-indigo-300 font-medium flex items-center gap-1.5">
                {isTranslating && <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />}
                {progressStatus}
              </span>
            ) : (
              <span>
                Selected to translate:{' '}
                <strong className="text-white">{selectedSummary.totalItems} item(s)</strong>
                {selectedSummary.alreadyCachedCount > 0 && (
                  <span className="text-amber-400 ml-1">
                    ({selectedSummary.alreadyCachedCount} already cached)
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Close
            </button>

            <button
              type="button"
              disabled={isTranslating || selectedSummary.totalItems === 0}
              onClick={handleExecuteTranslation}
              className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-950/40 transition cursor-pointer"
            >
              {isTranslating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Translating...</span>
                </>
              ) : selectedSummary.needsApiCount === 0 ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>All Items Already Translated (Skip API)</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-current" />
                  <span>
                    Translate {selectedSummary.needsApiCount} Item(s) to {targetLang === 'vi' ? 'Tiếng Việt' : 'English'}
                    {selectedSummary.alreadyCachedCount > 0 && ` (${selectedSummary.alreadyCachedCount} already cached)`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <GeminiApiKeyPromptModal
        isOpen={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
        onKeySaved={(newKey) => {
          setGeminiApiKey(newKey);
          setShowKeyInput(false);
          runTranslation(newKey);
        }}
      />
    </div>
  );
};
