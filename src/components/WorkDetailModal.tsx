import React, { useState, useEffect } from 'react';
import { WorkItem, TrackItem, FlatTrack } from '../types/asmr';
import { getWorkTracks, getWorkDetails, getWorkLanguageInfo, flattenTrackTree, formatBytes, formatDuration } from '../services/api';
import { TrackTree } from './TrackTree';
import {
  X,
  Star,
  Download,
  Play,
  Radio,
  FileArchive,
  Terminal,
  FileText,
  ExternalLink,
  FolderTree,
  Calendar,
  User,
  Tag,
  Sparkles,
  Info,
  Check,
  Copy,
  Globe,
} from 'lucide-react';

interface WorkDetailModalProps {
  work: WorkItem | null;
  onClose: () => void;
  onPlayTrack: (track: FlatTrack) => void;
  onPlayAll: (tracks: FlatTrack[]) => void;
  onReadScript: (title: string, textUrl: string) => void;
}

export const WorkDetailModal: React.FC<WorkDetailModalProps> = ({
  work,
  onClose,
  onPlayTrack,
  onPlayAll,
  onReadScript,
}) => {
  const [currentWork, setCurrentWork] = useState<WorkItem | null>(work);
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tracks' | 'downloader' | 'retro'>('tracks');
  const [copiedBatch, setCopiedBatch] = useState(false);

  useEffect(() => {
    setCurrentWork(work);
  }, [work]);

  useEffect(() => {
    if (!currentWork) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    getWorkTracks(currentWork.id)
      .then((data) => {
        if (isMounted) {
          setTracks(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to load tracks');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentWork]);

  const handleSwitchEdition = async (workno: string) => {
    try {
      setLoading(true);
      setError(null);
      const details = await getWorkDetails(workno);
      setCurrentWork(details);
    } catch (err: any) {
      setError(`Failed to load edition ${workno}: ${err.message}`);
      setLoading(false);
    }
  };

  if (!currentWork) return null;

  const rjCode = currentWork.source_id || `RJ${currentWork.id}`;
  const flattened = flattenTrackTree(tracks, currentWork.id, currentWork.title);
  const audioTracks = flattened.filter((t) => t.type === 'audio');
  const textTracks = flattened.filter((t) => t.type === 'text');
  const totalSizeBytes = flattened.reduce((acc, t) => acc + (t.size || 0), 0);
  const coverUrl = currentWork.mainCoverUrl || currentWork.samCoverUrl || currentWork.thumbnailCoverUrl;
  const langInfo = getWorkLanguageInfo(currentWork);

  const handleCopyBatchLinks = () => {
    const links = flattened
      .filter((t) => t.downloadUrl || t.streamUrl)
      .map((t) => t.downloadUrl || t.streamUrl)
      .join('\n');
    navigator.clipboard.writeText(links);
    setCopiedBatch(true);
    setTimeout(() => setCopiedBatch(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header with Title and Close */}
        <div className="p-4 sm:p-6 border-b border-slate-800 flex items-start justify-between gap-4">
          <div className="flex gap-4 min-w-0">
            {/* Thumbnail */}
            {coverUrl && (
              <div className="hidden sm:block w-24 h-24 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 shrink-0">
                <img src={coverUrl} alt={currentWork.title} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-md bg-red-600 font-extrabold text-white text-xs tracking-wider">
                  {rjCode}
                </span>
                <span className={`px-2 py-0.5 rounded-md font-bold text-xs flex items-center gap-1 border ${langInfo.primary.badgeClass}`}>
                  <span>{langInfo.primary.flag}</span>
                  <span>{langInfo.primary.label}</span>
                </span>
                {currentWork.rate_average_2dp ? (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/90 text-slate-950 font-bold text-xs flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    {currentWork.rate_average_2dp} ({currentWork.rate_count || 0} reviews)
                  </span>
                ) : null}
                <span className="text-xs text-slate-400">
                  DLs: <strong className="text-slate-200">{currentWork.dl_count?.toLocaleString() || 0}</strong>
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white leading-snug line-clamp-2" title={currentWork.title}>
                {currentWork.title}
              </h2>
              <div className="text-xs text-slate-400 flex items-center gap-3 flex-wrap">
                <span>Circle: <strong className="text-indigo-400">{currentWork.name || 'Unknown'}</strong></span>
                {currentWork.vas && currentWork.vas.length > 0 && (
                  <span>CV: <strong className="text-slate-200">{currentWork.vas.map((v) => v.name).join(', ')}</strong></span>
                )}
                {currentWork.release && <span>Release: {currentWork.release}</span>}
                <span>Total: <strong className="text-slate-200">{formatBytes(totalSizeBytes)}</strong></span>
              </div>

              {/* Language Editions Switcher */}
              {langInfo.hasMultipleEditions && langInfo.editions.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1 text-xs">
                  <span className="text-slate-400 flex items-center gap-1 font-semibold text-[11px]">
                    <Globe className="w-3 h-3 text-indigo-400" /> Language Editions:
                  </span>
                  {langInfo.editions.map((ed) => {
                    const isCurrent = ed.workno.toUpperCase() === rjCode.toUpperCase();
                    return (
                      <button
                        key={ed.workno}
                        type="button"
                        onClick={() => handleSwitchEdition(ed.workno)}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer border flex items-center gap-1 ${
                          isCurrent
                            ? 'bg-red-600/30 text-red-200 border-red-500/50 font-bold'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
                        }`}
                        title={`Switch to ${ed.label} (${ed.workno})`}
                      >
                        <span>{ed.label}</span>
                        <span className="text-[10px] opacity-75 font-mono">({ed.workno})</span>
                        {isCurrent && <span className="text-[9px] bg-red-600 text-white px-1 rounded">Active</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab navigation & Quick Buttons */}
        <div className="px-4 sm:px-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2 py-2.5">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('tracks')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'tracks'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FolderTree className="w-4 h-4 text-amber-400" />
              <span>Tracks ({flattened.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('downloader')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'downloader'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Downloader Hub</span>
            </button>

            <button
              onClick={() => setActiveTab('retro')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'retro'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="w-4 h-4 text-red-400" />
              <span>Opera Mini View</span>
            </button>
          </div>

          {/* Play All button */}
          {audioTracks.length > 0 && (
            <button
              onClick={() => onPlayAll(audioTracks)}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-red-950/40 transition cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Play All ({audioTracks.length} tracks)</span>
            </button>
          )}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
              <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">Fetching tracks structure from ASMR.one API...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-950/40 border border-red-800/80 rounded-xl text-red-300 text-xs">
              <p className="font-bold">Error loading tracks</p>
              <p className="mt-1">{error}</p>
            </div>
          )}

          {/* TAB 1: TRACKS & EXPLORER */}
          {!loading && !error && activeTab === 'tracks' && (
            <div className="space-y-4">
              <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
                <div className="flex items-center gap-4">
                  <span>Audio Tracks: <strong className="text-blue-400">{audioTracks.length}</strong></span>
                  <span>Scripts/TXT: <strong className="text-amber-400">{textTracks.length}</strong></span>
                  <span>Total Size: <strong className="text-slate-200">{formatBytes(totalSizeBytes)}</strong></span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Click on folder to expand &bull; Click download to save to device
                </div>
              </div>

              {tracks.length > 0 ? (
                <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3">
                  <TrackTree
                    tracks={tracks}
                    workId={currentWork.id}
                    workTitle={currentWork.title}
                    onPlayTrack={onPlayTrack}
                    onReadScript={onReadScript}
                  />
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-8">No track files listed for this release.</p>
              )}
            </div>
          )}

          {/* TAB 2: DOWNLOADER HUB */}
          {!loading && !error && activeTab === 'downloader' && (
            <div className="space-y-5">
              <div className="text-xs text-slate-300">
                Choose the best download format for your device, download manager, or legacy Symbian phone:
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1-Click ZIP Archive */}
                <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center gap-2 text-white font-bold text-sm">
                      <FileArchive className="w-5 h-5 text-amber-400" />
                      <span>ZIP Archive (Full Work)</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      Streams a live compressed ZIP file containing all audio tracks and drama scripts. Best for modern desktop &amp; Android.
                    </p>
                  </div>
                  <a
                    href={`/api/download/zip/${currentWork.id}`}
                    download={`${rjCode}_tracks.zip`}
                    className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition text-center"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Full ZIP Archive ({formatBytes(totalSizeBytes)})</span>
                  </a>
                </div>

                {/* Symbian RealPlayer M3U */}
                <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center gap-2 text-white font-bold text-sm">
                      <Radio className="w-5 h-5 text-emerald-400" />
                      <span>Symbian RealPlayer .M3U Playlist</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      Specially formatted for Nokia Symbian S60 RealPlayer, CorePlayer, Winamp, or VLC. Allows seamless online audio streaming track-by-track without downloading hundreds of megabytes.
                    </p>
                  </div>
                  <a
                    href={`/api/download/playlist.m3u?id=${currentWork.id}`}
                    download={`${rjCode}_playlist.m3u`}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition text-center"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download RealPlayer Playlist (.M3U)</span>
                  </a>
                </div>

                {/* Batch URLs Text File */}
                <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center gap-2 text-white font-bold text-sm">
                      <FileText className="w-5 h-5 text-blue-400" />
                      <span>Batch Links (.TXT)</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      Plain text list of direct track download URLs. Ideal for mass download managers like Aria2, Internet Download Manager (IDM), JDownloader, or NetFront/Symbian.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={`/api/download/batch-links.txt?id=${currentWork.id}`}
                      download={`links_${currentWork.id}.txt`}
                      className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition text-center"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download .TXT</span>
                    </a>
                    <button
                      onClick={handleCopyBatchLinks}
                      className="py-2 px-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {copiedBatch ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedBatch ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {/* Wget / cURL Bash Script */}
                <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center gap-2 text-white font-bold text-sm">
                      <Terminal className="w-5 h-5 text-indigo-400" />
                      <span>cURL / Wget Bash Script (.SH)</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      Auto-generated bash script that creates directories and downloads all tracks with resume support (<code className="text-indigo-300">curl -C -</code>). Works on Linux, macOS, and Termux.
                    </p>
                  </div>
                  <a
                    href={`/api/download/batch-script.sh?id=${currentWork.id}`}
                    download={`download_${currentWork.id}.sh`}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition text-center"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Bash Script (.SH)</span>
                  </a>
                </div>
              </div>

              {/* Tips for Symbian Users */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <Info className="w-4 h-4" />
                  <span>How to transfer and play on Nokia Symbian smartphones:</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-slate-400">
                  <li><strong>RealPlayer Streaming:</strong> In Opera Mini or Symbian Web Browser, visit <code className="text-white">/classic/work/{currentWork.id}</code> and click <code className="text-white">[RealPlayer M3U]</code>. The phone will automatically launch RealPlayer and stream each track sequentially!</li>
                  <li><strong>Direct File Download:</strong> Click <code className="text-white">[Download]</code> on any individual track to save it directly into <code className="text-white">E:\Sounds\Digital\</code> on your MicroSD card. Our proxy enforces HTTP Range requests so downloads can be paused and resumed if your 2G/3G connection drops!</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 3: RETRO / OPERA MINI PREVIEW */}
          {!loading && !error && activeTab === 'retro' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>
                  Below is the exact pure server-rendered HTML view served to Opera Mini and Symbian devices at <code className="text-red-400">/classic/work/{currentWork.id}</code>:
                </span>
                <a
                  href={`/classic/work/${currentWork.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-red-400 hover:text-red-300 font-semibold flex items-center gap-1"
                >
                  <span>Open in new tab</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="border border-slate-700 rounded-xl overflow-hidden shadow-inner bg-white">
                <iframe
                  src={`/classic/work/${currentWork.id}`}
                  title="Opera Mini Preview"
                  className="w-full h-[480px] border-0"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
