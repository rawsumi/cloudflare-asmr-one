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
import { TitleTranslationModal } from './components/TitleTranslationModal';
import { TranslatedWorksPage } from './components/TranslatedWorksPage';
import { checkServerCachedTitles, fetchPermanentTranslatedWorks } from './services/clientGeminiTranslator';
import { setCachedTitles } from './services/titleTranslationCache';
import { Sparkles, Radio, Smartphone, AlertCircle, ChevronLeft, ChevronRight, HelpCircle, Clock, Flame, Star, Tag, X, Shield, AlertTriangle, Languages } from 'lucide-react';

export default function App() {
  const [query, setQuery] = useState('');
  const [quickRj, setQuickRj] = useState('');
  const [order, setOrder] = useState('release');
  const [sort, setSort] = useState('desc');
  const [hasSubtitle, setHasSubtitle] = useState(false);
  const [lang, setLang] = useState('all');
  const [tag, setTag] = useState('');
  const [nsfw, setNsfw] = useState('all');
  const [page, setPage] = useState(1);

  const [works, setWorks] = useState<WorkItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // View mode: 'browse' (catalog search) or 'translated' (permanent translated vault)
  const [currentView, setCurrentView] = useState<'browse' | 'translated'>('browse');
  const [vaultCount, setVaultCount] = useState<number>(0);

  // Modals & Player State
  const [selectedWork, setSelectedWork] = useState<WorkItem | null>(null);
  const [currentTrack, setCurrentTrack] = useState<FlatTrack | null>(null);
  const [playlist, setPlaylist] = useState<FlatTrack[]>([]);
  const [scriptModal, setScriptModal] = useState<{ title: string; textUrl: string } | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isTranslatorOpen, setIsTranslatorOpen] = useState(false);
  const [selectedWorkForTranslation, setSelectedWorkForTranslation] = useState<WorkItem | null>(null);

  // Sync permanent vault statistics
  const refreshVaultStats = useCallback(() => {
    fetchPermanentTranslatedWorks('all').then((res) => {
      setVaultCount(res.total || (res.works || []).length);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    refreshVaultStats();
    const handleUpdate = () => refreshVaultStats();
    window.addEventListener('retroasmr-titles-updated', handleUpdate);
    return () => window.removeEventListener('retroasmr-titles-updated', handleUpdate);
  }, [refreshVaultStats]);

  // Perform search
  const executeSearch = useCallback(
    async (
      searchQuery: string = query,
      pageNum: number = page,
      tagFilter: string = tag,
      nsfwFilter: string = nsfw
    ) => {
      setLoading(true);
      setError(null);

      try {
        const data = await searchWorks(
          searchQuery,
          pageNum,
          order,
          sort,
          hasSubtitle || undefined,
          lang,
          tagFilter,
          nsfwFilter
        );
        const fetchedWorks = data.works || [];
        setWorks(fetchedWorks);

        // Sync server cache for newly loaded work titles
        const titles = fetchedWorks.map((w: WorkItem) => w.title).filter(Boolean);
        if (titles.length > 0) {
          checkServerCachedTitles(titles, 'en').then((res) => {
            if (res.cached && Object.keys(res.cached).length > 0) {
              setCachedTitles(res.cached, 'en');
            }
          });
          checkServerCachedTitles(titles, 'vi').then((res) => {
            if (res.cached && Object.keys(res.cached).length > 0) {
              setCachedTitles(res.cached, 'vi');
            }
          });
        }

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
    [query, page, order, sort, hasSubtitle, lang, tag, nsfw]
  );

  // Initial load: show recent releases
  useEffect(() => {
    executeSearch('', 1, '', 'all');
  }, []);

  // When order, sort, subtitle, language, tag, or nsfw change, re-run search from page 1
  useEffect(() => {
    executeSearch(query, 1, tag, nsfw);
  }, [order, sort, hasSubtitle, lang, tag, nsfw]);

  const handleSearchSubmit = (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const q = customQuery !== undefined ? customQuery : query;
    setPage(1);
    executeSearch(q, 1, tag, nsfw);
  };

  const handleQuickRjSearch = (rj: string) => {
    setQuery(rj);
    setTag('');
    setPage(1);
    executeSearch(rj, 1, '', nsfw);
  };

  const handleFilterByTag = (tagName: string) => {
    setTag((prev) => (prev === tagName ? '' : tagName));
    setPage(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFilterByVa = (vaName: string) => {
    setQuery(vaName);
    setPage(1);
    executeSearch(vaName, 1, tag, nsfw);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFilterByCircle = (circleName: string) => {
    setQuery(circleName);
    setPage(1);
    executeSearch(circleName, 1, tag, nsfw);
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
        onOpenTranslator={() => {
          setSelectedWorkForTranslation(null);
          setIsTranslatorOpen(true);
        }}
        quickRj={quickRj}
        setQuickRj={setQuickRj}
        onSearchRj={handleQuickRjSearch}
        currentView={currentView}
        onNavigateView={setCurrentView}
        vaultWorksCount={vaultCount}
      />

      {/* Main View Area: Translated Works Vault Page or Browse Catalog */}
      {currentView === 'translated' ? (
        <TranslatedWorksPage
          onSelectWork={(work) => setSelectedWork(work)}
          onOpenTranslator={(work) => {
            setSelectedWorkForTranslation(work || null);
            setIsTranslatorOpen(true);
          }}
          onNavigateToBrowse={() => setCurrentView('browse')}
        />
      ) : (
        <>
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
        tag={tag}
        setTag={setTag}
        nsfw={nsfw}
        setNsfw={setNsfw}
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
              onClick={() => executeSearch(query, page, tag)}
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
              Try searching with an exact RJ code (e.g. <span className="text-slate-200">RJ01632573</span>), broad keywords, or clearing your tag filter.
            </p>
            <button
              onClick={() => {
                setQuery('');
                setTag('');
                setOrder('release');
                setSort('desc');
                executeSearch('', 1, '', 'all');
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition"
            >
              Reset to Recent Releases
            </button>
          </div>
        )}

        {/* Works Grid */}
        {!loading && !error && works.length > 0 && (
          <div className="space-y-6">
            {/* Results Toolbar & Instant Sort Switcher */}
            <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs shadow-lg">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-400 font-medium">
                  Showing <strong className="text-white font-bold">{works.length}</strong> of{' '}
                  <strong className="text-slate-200">{totalCount}</strong> works
                </span>

                {query && (
                  <span className="bg-slate-800 text-slate-200 px-2.5 py-1 rounded-lg border border-slate-700 flex items-center gap-1 font-mono">
                    <span>"{query}"</span>
                    <button
                      onClick={() => {
                        setQuery('');
                        executeSearch('', 1, tag, nsfw);
                      }}
                      className="hover:text-red-400 p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {tag && (
                  <span className="bg-red-950/60 text-red-200 px-2.5 py-1 rounded-lg border border-red-800/60 flex items-center gap-1 font-semibold">
                    <Tag className="w-3 h-3 text-red-400" />
                    <span>#{tag}</span>
                    <button onClick={() => handleFilterByTag(tag)} className="hover:text-white p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {nsfw === 'sfw' && (
                  <span className="bg-emerald-950/60 text-emerald-300 px-2 py-0.5 rounded-lg border border-emerald-800/60 flex items-center gap-1">
                    <Shield className="w-3 h-3" /> SFW Only
                  </span>
                )}
                {nsfw === 'nsfw' && (
                  <span className="bg-rose-950/60 text-rose-300 px-2 py-0.5 rounded-lg border border-rose-800/60 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> 18+ Adult
                  </span>
                )}
              </div>

              {/* Sort Switcher Tabs */}
              <div className="flex items-center gap-1 bg-slate-950/90 p-1 rounded-xl border border-slate-800 self-start md:self-auto overflow-x-auto max-w-full">
                <button
                  type="button"
                  onClick={() => {
                    setOrder('release');
                    setSort('desc');
                  }}
                  className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    order === 'release' && sort === 'desc'
                      ? 'bg-red-600 text-white font-bold shadow-md shadow-red-950/50'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Sort by latest release date (Recent first)"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-300" />
                  <span>Recent</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOrder('dl_count');
                    setSort('desc');
                  }}
                  className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    order === 'dl_count' && sort === 'desc'
                      ? 'bg-red-600 text-white font-bold shadow-md shadow-red-950/50'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Sort by download count (All-time popular)"
                >
                  <Flame className="w-3.5 h-3.5 text-rose-400" />
                  <span>Top Popular</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOrder('rating');
                    setSort('desc');
                  }}
                  className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    order === 'rating' && sort === 'desc'
                      ? 'bg-red-600 text-white font-bold shadow-md shadow-red-950/50'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Sort by highest user ratings"
                >
                  <Star className="w-3.5 h-3.5 text-amber-400" />
                  <span>Top Rated</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOrder('create_date');
                    setSort('desc');
                  }}
                  className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    order === 'create_date' && sort === 'desc'
                      ? 'bg-red-600 text-white font-bold shadow-md shadow-red-950/50'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Sort by newly added catalog entries"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>New Added</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {works.map((work) => (
                <WorkCard
                  key={work.id}
                  work={work}
                  activeTag={tag}
                  onSelectWork={(w) => setSelectedWork(w)}
                  onPlayWork={handlePlayWorkPreview}
                  onFilterByVa={handleFilterByVa}
                  onFilterByCircle={handleFilterByCircle}
                  onFilterByTag={handleFilterByTag}
                  onTranslateWork={(w) => {
                    setSelectedWorkForTranslation(w);
                    setIsTranslatorOpen(true);
                  }}
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
        </>
      )}

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
          onFilterByTag={handleFilterByTag}
          onOpenTranslator={(w) => {
            setSelectedWorkForTranslation(w);
            setIsTranslatorOpen(true);
          }}
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

      {/* Manual Title & Track Translation Modal */}
      <TitleTranslationModal
        isOpen={isTranslatorOpen}
        onClose={() => {
          setIsTranslatorOpen(false);
          setSelectedWorkForTranslation(null);
        }}
        initialWork={selectedWorkForTranslation}
        availableWorks={works}
      />

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
