import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Copy,
  Check,
  Download,
  Type,
  FileText,
  Languages,
  Sparkles,
  Columns,
  List,
  Search,
  RefreshCw,
  Sliders,
  CheckCircle2,
  BookOpen,
} from 'lucide-react';
import {
  getDownloadProxyUrl,
  SCRIPT_TRANSLATE_LANGUAGES,
  translateScriptText,
  TranslateTextResponse,
} from '../services/api';

interface ScriptViewerModalProps {
  title: string;
  textUrl: string;
  onClose: () => void;
}

type ViewMode = 'original' | 'translated' | 'split' | 'bilingual';
type TranslateTone = 'asmr' | 'natural' | 'literal';

export const ScriptViewerModal: React.FC<ScriptViewerModalProps> = ({
  title,
  textUrl,
  onClose,
}) => {
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Translation State
  const [targetLang, setTargetLang] = useState<string>('en');
  const [tone, setTone] = useState<TranslateTone>('asmr');
  const [viewMode, setViewMode] = useState<ViewMode>('original');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationCache, setTranslationCache] = useState<
    Record<string, { translated: string; bilingual: string; engine: string; charCount: number }>
  >({});
  const [translateError, setTranslateError] = useState<string | null>(null);

  // UI state
  const [copied, setCopied] = useState<'orig' | 'trans' | 'bi' | false>(false);
  const [fontSize, setFontSize] = useState<number>(13);
  const [showLineNumbers, setShowLineNumbers] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Fetch original script
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(textUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.text();
      })
      .then((data) => {
        if (isMounted) {
          setOriginalContent(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to fetch script');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [textUrl]);

  // Execute translation
  const handleTranslate = async (forceRefresh: boolean = false) => {
    const cacheKey = `${targetLang}_${tone}`;
    if (!forceRefresh && translationCache[cacheKey]) {
      if (viewMode === 'original') setViewMode('translated');
      return;
    }

    setIsTranslating(true);
    setTranslateError(null);

    try {
      // Run translation for translated mode and bilingual mode
      const [transRes, biRes] = await Promise.all([
        translateScriptText({
          text: originalContent,
          targetLang,
          mode: 'translated',
          tone,
        }),
        translateScriptText({
          text: originalContent,
          targetLang,
          mode: 'bilingual',
          tone,
        }),
      ]);

      setTranslationCache((prev) => ({
        ...prev,
        [cacheKey]: {
          translated: transRes.translatedText,
          bilingual: biRes.translatedText,
          engine: transRes.engine,
          charCount: transRes.charCount,
        },
      }));

      if (viewMode === 'original') {
        setViewMode('translated');
      }
    } catch (err: any) {
      setTranslateError(err.message || 'Translation failed');
    } finally {
      setIsTranslating(false);
    }
  };

  const currentCacheKey = `${targetLang}_${tone}`;
  const currentTranslation = translationCache[currentCacheKey];

  const handleCopy = (text: string, type: 'orig' | 'trans' | 'bi') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadText = (content: string, suffix: string) => {
    const cleanTitle = title.replace(/\.[^/.]+$/, '');
    const filename = `${cleanTitle}_${suffix}.txt`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const origLineCount = originalContent ? originalContent.split('\n').length : 0;
  const origCharCount = originalContent ? originalContent.length : 0;
  const selectedLangObj = SCRIPT_TRANSLATE_LANGUAGES.find((l) => l.code === targetLang) || SCRIPT_TRANSLATE_LANGUAGES[0];

  // Render text with search highlighting
  const renderTextContent = (text: string) => {
    if (!text) return <span className="text-slate-500 italic">Empty text</span>;
    const lines = text.split('\n');

    return (
      <div className="font-mono leading-relaxed select-text space-y-1">
        {lines.map((line, idx) => {
          const isMatch = searchQuery && line.toLowerCase().includes(searchQuery.toLowerCase());
          const isTimecode = /^\[?\d{1,2}:\d{2}/.test(line.trim());
          const isCue = /^[【(（[].+[】)）\]]/.test(line.trim());
          const isSpeaker = /^(CV|Character|Voice|Actor|Name|名前|演)/i.test(line.trim());

          return (
            <div
              key={idx}
              className={`flex items-start gap-3 px-2 py-0.5 rounded transition ${
                isMatch ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40' : 'hover:bg-slate-800/40'
              }`}
            >
              {showLineNumbers && (
                <span className="w-8 shrink-0 text-right text-[10px] text-slate-600 select-none font-mono pt-0.5">
                  {idx + 1}
                </span>
              )}
              <span
                style={{ fontSize: `${fontSize}px` }}
                className={`whitespace-pre-wrap break-words flex-1 ${
                  isTimecode
                    ? 'text-cyan-400 font-semibold'
                    : isSpeaker
                    ? 'text-purple-300 font-bold'
                    : isCue
                    ? 'text-amber-300/90 italic'
                    : 'text-slate-200'
                }`}
              >
                {line}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 lg:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Header Bar */}
        <div className="p-3.5 bg-slate-850 border-b border-slate-700/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 truncate">
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-sm truncate" title={title}>
                  {title}
                </h3>
                {currentTranslation && (
                  <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold rounded-full flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" />
                    AI Translated ({selectedLangObj.short})
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {origLineCount} lines &bull; {origCharCount.toLocaleString()} chars &bull; Japanese Voice Drama Script
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Font Size Adjuster */}
            <div className="flex items-center gap-1 bg-slate-950/60 px-2 py-1 rounded-lg border border-slate-800 text-xs text-slate-300">
              <Type className="w-3.5 h-3.5 text-slate-500" />
              <button
                onClick={() => setFontSize((s) => Math.max(s - 1, 10))}
                className="px-1 hover:text-white font-bold cursor-pointer"
                title="Decrease font size"
              >
                -
              </button>
              <span className="text-[11px] font-mono w-4 text-center">{fontSize}</span>
              <button
                onClick={() => setFontSize((s) => Math.min(s + 1, 22))}
                className="px-1 hover:text-white font-bold cursor-pointer"
                title="Increase font size"
              >
                +
              </button>
            </div>

            {/* Line Number Toggle */}
            <button
              onClick={() => setShowLineNumbers(!showLineNumbers)}
              className={`p-1.5 rounded-lg border text-xs transition cursor-pointer flex items-center gap-1 ${
                showLineNumbers
                  ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/40'
                  : 'bg-slate-850 hover:bg-slate-800 text-slate-400 border-slate-700'
              }`}
              title="Toggle line numbers"
            >
              <List className="w-4 h-4" />
              <span className="hidden md:inline text-[11px]">#</span>
            </button>

            {/* Quick Copy dropdown/button */}
            <button
              onClick={() => {
                const textToCopy =
                  viewMode === 'bilingual' && currentTranslation
                    ? currentTranslation.bilingual
                    : viewMode === 'translated' && currentTranslation
                    ? currentTranslation.translated
                    : originalContent;
                handleCopy(textToCopy, viewMode === 'bilingual' ? 'bi' : viewMode === 'translated' ? 'trans' : 'orig');
              }}
              className="px-2.5 py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-200 rounded-lg border border-slate-700 transition cursor-pointer flex items-center gap-1.5 text-xs font-medium"
              title="Copy active text"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>

            {/* Download Button */}
            <button
              onClick={() => {
                if (viewMode === 'bilingual' && currentTranslation) {
                  handleDownloadText(currentTranslation.bilingual, `bilingual_${targetLang}`);
                } else if (viewMode === 'translated' && currentTranslation) {
                  handleDownloadText(currentTranslation.translated, `translated_${targetLang}`);
                } else {
                  const url = getDownloadProxyUrl(textUrl, title);
                  window.location.href = url;
                }
              }}
              className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition flex items-center gap-1.5 text-xs font-semibold shadow-sm cursor-pointer"
              title="Download text file"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Save</span>
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Translation Toolbar & Language Switcher */}
        <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Tabs */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
              <button
                onClick={() => setViewMode('original')}
                className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer flex items-center gap-1 ${
                  viewMode === 'original'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-3 h-3" />
                Original (原文)
              </button>
              <button
                onClick={() => {
                  if (!currentTranslation && !isTranslating) {
                    handleTranslate();
                  }
                  setViewMode('translated');
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer flex items-center gap-1 ${
                  viewMode === 'translated'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Languages className="w-3 h-3" />
                Translated ({selectedLangObj.short})
              </button>
              <button
                onClick={() => {
                  if (!currentTranslation && !isTranslating) {
                    handleTranslate();
                  }
                  setViewMode('split');
                }}
                className={`hidden md:flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                  viewMode === 'split'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Columns className="w-3 h-3" />
                Side-by-Side
              </button>
              <button
                onClick={() => {
                  if (!currentTranslation && !isTranslating) {
                    handleTranslate();
                  }
                  setViewMode('bilingual');
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer flex items-center gap-1 ${
                  viewMode === 'bilingual'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <List className="w-3 h-3" />
                Bilingual (対訳)
              </button>
            </div>

            {/* Target Language Selector */}
            <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
              <span className="text-slate-500 font-medium">To:</span>
              <select
                value={targetLang}
                onChange={(e) => {
                  setTargetLang(e.target.value);
                }}
                className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer text-xs"
              >
                {SCRIPT_TRANSLATE_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code} className="bg-slate-900 text-white">
                    {lang.flag} {lang.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Translate Button */}
            <button
              onClick={() => handleTranslate(!!currentTranslation)}
              disabled={isTranslating || loading}
              className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm ${
                isTranslating
                  ? 'bg-indigo-700/50 text-indigo-300 border border-indigo-500/30'
                  : currentTranslation
                  ? 'bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-600/50'
                  : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white'
              }`}
            >
              {isTranslating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Translating Script...</span>
                </>
              ) : currentTranslation ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Re-translate</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Translate with AI</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* In-text Search Bar */}
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 pointer-events-none" />
              <input
                type="text"
                placeholder="Find in script..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 pr-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-28 sm:w-36 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1.5 text-slate-500 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Translation Tone Settings Toggle */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                showSettings
                  ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                  : 'bg-slate-950 hover:bg-slate-800 text-slate-400 border-slate-800'
              }`}
              title="Translation Style Settings"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Translation Tone Settings Bar (Collapsible) */}
        {showSettings && (
          <div className="px-4 py-2 bg-indigo-950/40 border-b border-indigo-900/40 flex flex-wrap items-center justify-between gap-3 text-xs animate-in slide-in-from-top duration-150">
            <div className="flex items-center gap-3">
              <span className="text-indigo-300 font-semibold flex items-center gap-1">
                <Sliders className="w-3 h-3" /> Translation Style:
              </span>
              <div className="flex items-center gap-1.5">
                {[
                  { id: 'asmr', label: '🎙️ ASMR & Roleplay (Nuance & Whispers)', desc: 'Intimate audio dialogue' },
                  { id: 'natural', label: '💬 Natural Conversational', desc: 'Fluent everyday' },
                  { id: 'literal', label: '📖 Literal & Direct', desc: 'Direct faithful translation' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTone(t.id as TranslateTone)}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                      tone === t.id
                        ? 'bg-indigo-600 text-white font-bold shadow-sm'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            {currentTranslation && (
              <span className="text-[10px] text-indigo-400">
                Engine: <strong className="text-indigo-200">{currentTranslation.engine}</strong>
              </span>
            )}
          </div>
        )}

        {/* Error Notification */}
        {translateError && (
          <div className="px-4 py-2 bg-red-950/60 border-b border-red-800 text-red-300 text-xs flex items-center justify-between">
            <span>Translation Error: {translateError}</span>
            <button
              onClick={() => setTranslateError(null)}
              className="text-red-400 hover:text-white font-bold px-1"
            >
              &times;
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden bg-slate-950/70 relative flex flex-col">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16 text-slate-400 space-y-2">
              <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">Loading script text...</p>
            </div>
          ) : error ? (
            <div className="p-6 text-center text-red-400 text-sm">
              Failed to load script text: {error}
            </div>
          ) : viewMode === 'split' ? (
            /* Side by Side Split View */
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800 overflow-hidden">
              {/* Left Column: Original Japanese */}
              <div className="flex flex-col h-full overflow-hidden">
                <div className="p-2 bg-slate-900/80 border-b border-slate-800 text-[11px] font-bold text-slate-400 flex items-center justify-between">
                  <span>🇯🇵 Original Japanese Script</span>
                  <button
                    onClick={() => handleCopy(originalContent, 'orig')}
                    className="hover:text-white text-[10px] font-medium"
                  >
                    Copy Original
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                  {renderTextContent(originalContent)}
                </div>
              </div>

              {/* Right Column: Translation */}
              <div className="flex flex-col h-full overflow-hidden bg-indigo-950/10">
                <div className="p-2 bg-indigo-950/40 border-b border-indigo-900/50 text-[11px] font-bold text-indigo-300 flex items-center justify-between">
                  <span>
                    {selectedLangObj.flag} Translated in {selectedLangObj.label}
                  </span>
                  {currentTranslation && (
                    <button
                      onClick={() => handleCopy(currentTranslation.translated, 'trans')}
                      className="hover:text-white text-[10px] font-medium"
                    >
                      Copy Translated
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                  {isTranslating ? (
                    <div className="h-full flex flex-col items-center justify-center py-16 text-indigo-300 space-y-3">
                      <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs font-medium">Translating script with AI Studio...</p>
                      <p className="text-[11px] text-slate-400">Preserving timecodes &amp; intimate voice acting cues</p>
                    </div>
                  ) : currentTranslation ? (
                    renderTextContent(currentTranslation.translated)
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
                      <Sparkles className="w-8 h-8 text-indigo-400 opacity-60" />
                      <p className="text-xs">No translation generated yet for this language.</p>
                      <button
                        onClick={() => handleTranslate()}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow"
                      >
                        Translate to {selectedLangObj.label}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : viewMode === 'bilingual' ? (
            /* Bilingual Interleaved View */
            <div className="flex-1 overflow-y-auto p-3 sm:p-6">
              {isTranslating ? (
                <div className="h-full flex flex-col items-center justify-center py-16 text-indigo-300 space-y-3">
                  <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-medium">Generating Bilingual Script...</p>
                </div>
              ) : currentTranslation ? (
                renderTextContent(currentTranslation.bilingual)
              ) : (
                <div className="h-full flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
                  <Sparkles className="w-8 h-8 text-indigo-400 opacity-60" />
                  <p className="text-xs">Click below to generate synchronized bilingual script.</p>
                  <button
                    onClick={() => handleTranslate()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow"
                  >
                    Generate Bilingual ({selectedLangObj.short})
                  </button>
                </div>
              )}
            </div>
          ) : viewMode === 'translated' ? (
            /* Translated Only View */
            <div className="flex-1 overflow-y-auto p-3 sm:p-6">
              {isTranslating ? (
                <div className="h-full flex flex-col items-center justify-center py-16 text-indigo-300 space-y-3">
                  <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-medium">Translating script with AI Studio...</p>
                </div>
              ) : currentTranslation ? (
                renderTextContent(currentTranslation.translated)
              ) : (
                <div className="h-full flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
                  <Sparkles className="w-8 h-8 text-indigo-400 opacity-60" />
                  <p className="text-xs">No translation loaded yet.</p>
                  <button
                    onClick={() => handleTranslate()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow"
                  >
                    Translate to {selectedLangObj.label}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Original Raw Script View */
            <div className="flex-1 overflow-y-auto p-3 sm:p-6">
              {renderTextContent(originalContent)}
            </div>
          )}
        </div>

        {/* Bottom Footer Info Bar */}
        <div className="p-2.5 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-slate-300">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              ASMR Script Engine
            </span>
            <span className="text-slate-600">&bull;</span>
            <span>Supports .txt, .lrc, .srt, .vtt</span>
          </div>

          <div className="flex items-center gap-2">
            {currentTranslation && (
              <span className="text-indigo-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Translated to {selectedLangObj.label} ({currentTranslation.charCount.toLocaleString()} chars)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
