/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { WorkItem, FlatTrack } from './types/asmr';
import { searchWorks, getWorkTracks, flattenTrackTree } from './services/api';
import { Navbar } from './components/Navbar';
import { SearchHeader } from './components/SearchHeader';
import { WorkCard } from './components/WorkCard';
import { WorkDetailModal } from './components/WorkDetailModal';
import { AudioPlayer } from './components/AudioPlayer';
import { ScriptViewerModal } from './components/ScriptViewerModal';
import { OperaMiniSimulator } from './components/OperaMiniSimulator';
import { RetroExplainModal } from './components/RetroExplainModal';
import { Sparkles, Radio, Smartphone, AlertCircle, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';

export default function App() {
  const [query, setQuery] = useState('');
  const [quickRj, setQuickRj] = useState('');
  const [order, setOrder] = useState('dl_count');
  const [sort, setSort] = useState('desc');
  const [hasSubtitle, setHasSubtitle] = useState(false);
  const [lang, setLang] = useState('all');
  const [page, setPage] = useState(1);

  const [works, setWorks] = useState<WorkItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals & Player State
  const [selectedWork, setSelectedWork] = useState<WorkItem | null>(null);
  const [currentTrack, setCurrentTrack] = useState<FlatTrack | null>(null);
  const [playlist, setPlaylist] = useState<FlatTrack[]>([]);
  const [scriptModal, setScriptModal] = useState<{ title: string; textUrl: string } | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // Perform search
  const executeSearch = useCallback(
    async (searchQuery: string = query, pageNum: number = page) => {
      setLoading(true);
      setError(null);

      try {
        const data = await searchWorks(searchQuery, pageNum, order, sort, hasSubtitle || undefined, lang);
        setWorks(data.works || []);
        if (data.pagination) {
          setTotalCount(data.pagination.totalCount || 0);
          setPageSize(data.pagination.pageSize || 20);
          setPage(data.pagination.currentPage || pageNum);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to search works');
        setWorks([]);
      } finally {
        setLoading(false);
      }
    },
    [query, page, order, sort, hasSubtitle, lang]
  );

  // Initial load: show popular works
  useEffect(() => {
    executeSearch('', 1);
  }, []);

  // When order, sort, subtitle or language change, re-run search from page 1
  useEffect(() => {
    executeSearch(query, 1);
  }, [order, sort, hasSubtitle, lang]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPage(1);
    executeSearch(query, 1);
  };

  const handleQuickRjSearch = (rj: string) => {
    setQuery(rj);
    setPage(1);
    executeSearch(rj, 1);
  };

  const handleFilterByVa = (vaName: string) => {
    setQuery(vaName);
    setPage(1);
    executeSearch(vaName, 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFilterByCircle = (circleName: string) => {
    setQuery(circleName);
    setPage(1);
    executeSearch(circleName, 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Quick play preview for card
  const handlePlayWorkPreview = async (work: WorkItem) => {
    try {
      const tracksData = await getWorkTracks(work.id);
      const flat = flattenTrackTree(tracksData, work.id, work.title);
      const audioTracks = flat.filter((t) => t.type === 'audio');
      if (audioTracks.length > 0) {
        setPlaylist(audioTracks);
        setCurrentTrack(audioTracks[0]);
      } else {
        setSelectedWork(work); // open modal if no audio found directly
      }
    } catch (err) {
      console.error('Failed to load audio tracks:', err);
      setSelectedWork(work);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
    executeSearch(query, newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-red-600 selection:text-white pb-24">
      {/* Top Navbar */}
      <Navbar
        onOpenSimulator={() => setIsSimulatorOpen(true)}
        onOpenGuide={() => setIsGuideOpen(true)}
        quickRj={quickRj}
        setQuickRj={setQuickRj}
        onSearchRj={handleQuickRjSearch}
      />

      {/* Search Header */}
      <SearchHeader
        query={query}
        setQuery={setQuery}
        onSearch={handleSearchSubmit}
        order={order}
        setOrder={setOrder}
        sort={sort}
        setSort={setSort}
        hasSubtitle={hasSubtitle}
        setHasSubtitle={setHasSubtitle}
        lang={lang}
        setLang={setLang}
        loading={loading}
        totalCount={totalCount}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Loading Spinner */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
            <div className="w-10 h-10 border-3 border-red-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium">Fetching ASMR works from ASMR.one API...</p>
          </div>
        )}

        {/* Error message */}
        {!loading && error && (
          <div className="bg-red-950/40 border border-red-800/80 rounded-2xl p-6 text-center max-w-xl mx-auto space-y-2">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
            <h3 className="font-bold text-white text-base">Unable to load ASMR works</h3>
            <p className="text-xs text-red-300">{error}</p>
            <button
              onClick={() => executeSearch(query, page)}
              className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              Retry Search
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && works.length === 0 && (
          <div className="text-center py-20 max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <Radio className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">No ASMR works found</h3>
            <p className="text-xs text-slate-400">
              Try searching with an exact RJ code (e.g. <span className="text-slate-200">RJ01632573</span>) or broad keywords like &quot;whisper&quot; or &quot;binaural&quot;.
            </p>
            <button
              onClick={() => {
                setQuery('');
                executeSearch('', 1);
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
            >
              Reset to Popular Works
            </button>
          </div>
        )}

        {/* Works Grid */}
        {!loading && !error && works.length > 0 && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {works.map((work) => (
                <WorkCard
                  key={work.id}
                  work={work}
                  onSelectWork={(w) => setSelectedWork(w)}
                  onPlayWork={handlePlayWorkPreview}
                  onFilterByVa={handleFilterByVa}
                  onFilterByCircle={handleFilterByCircle}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-6 border-t border-slate-800 text-xs">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-2 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:pointer-events-none border border-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>

                <div className="flex items-center gap-1 px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-slate-400">
                  <span>Page</span>
                  <span className="font-bold text-white font-mono">{page}</span>
                  <span>of</span>
                  <span className="font-bold text-slate-300 font-mono">{totalPages}</span>
                </div>

                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-2 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:pointer-events-none border border-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Fixed Bottom Audio Player */}
      <AudioPlayer
        currentTrack={currentTrack}
        playlist={playlist}
        onTrackChange={(track) => setCurrentTrack(track)}
        onClosePlayer={() => setCurrentTrack(null)}
      />

      {/* Work Detail & Download Hub Modal */}
      {selectedWork && (
        <WorkDetailModal
          work={selectedWork}
          onClose={() => setSelectedWork(null)}
          onPlayTrack={(track) => {
            setPlaylist([track]);
            setCurrentTrack(track);
          }}
          onPlayAll={(audioTracks) => {
            setPlaylist(audioTracks);
            if (audioTracks.length > 0) setCurrentTrack(audioTracks[0]);
          }}
          onReadScript={(title, textUrl) => setScriptModal({ title, textUrl })}
        />
      )}

      {/* Voice Drama Script Viewer Modal */}
      {scriptModal && (
        <ScriptViewerModal
          title={scriptModal.title}
          textUrl={scriptModal.textUrl}
          onClose={() => setScriptModal(null)}
        />
      )}

      {/* Symbian OS & Opera Mini Device Simulator */}
      {isSimulatorOpen && (
        <OperaMiniSimulator
          onClose={() => setIsSimulatorOpen(false)}
          initialWorkId={selectedWork?.id}
        />
      )}

      {/* Backward Compatibility Architecture Guide */}
      {isGuideOpen && <RetroExplainModal onClose={() => setIsGuideOpen(false)} />}
    </div>
  );
}
