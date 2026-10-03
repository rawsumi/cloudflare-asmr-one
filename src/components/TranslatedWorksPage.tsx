import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Languages,
  Search,
  BookOpen,
  Music,
  ExternalLink,
  Shield,
  CheckCircle2,
  Clock,
  Layers,
  Filter,
  RefreshCw,
  Play,
  ListMusic,
  ArrowRight,
  Database,
  Check,
} from 'lucide-react';
import { fetchPermanentTranslatedWorks } from '../services/clientGeminiTranslator';
import { useTitleTranslation } from '../services/titleTranslationCache';
import { WorkItem } from '../types/asmr';

interface TranslatedWorkRecord {
  id: string | number;
  rjCode: string;
  originalTitle: string;
  translatedTitle: {
    en?: string;
    vi?: string;
  };
  translatedTracksCount: number;
  totalTracksCount?: number;
  translatedAt: string;
  coverUrl?: string;
  circle?: string;
  vas?: string;
  tags?: string[];
  trackTranslations?: Record<string, { en?: string; vi?: string }>;
}

interface TranslatedWorksPageProps {
  onSelectWork: (work: WorkItem) => void;
  onOpenTranslator: (work?: WorkItem) => void;
  onNavigateToBrowse: () => void;
}

export const TranslatedWorksPage: React.FC<TranslatedWorksPageProps> = ({
  onSelectWork,
  onOpenTranslator,
  onNavigateToBrowse,
}) => {
  const { displayMode, setDisplayMode } = useTitleTranslation();
  const [works, setWorks] = useState<TranslatedWorkRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [vaultStats, setVaultStats] = useState<{
    totalWorks: number;
    enWorksCount: number;
    viWorksCount: number;
    totalTitlesCached: number;
  }>({
    totalWorks: 0,
    enWorksCount: 0,
    viWorksCount: 0,
    totalTitlesCached: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [langFilter, setLangFilter] = useState<'all' | 'en' | 'vi'>('all');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const loadVaultWorks = useCallback(async (lang = langFilter, q = searchQuery) => {
    setLoading(true);
    try {
      const res = await fetchPermanentTranslatedWorks(lang, q);
      setWorks(res.works || []);
      setTotalCount(res.total || (res.works || []).length);
      if (res.stats) {
        setVaultStats(res.stats);
      }
    } catch (err) {
      console.error('Failed to load translated works:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [langFilter, searchQuery]);

  useEffect(() => {
    loadVaultWorks(langFilter, searchQuery);
  }, [langFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadVaultWorks(langFilter, searchQuery);
  };

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    loadVaultWorks(langFilter, searchQuery);
  };

  // Convert TranslatedWorkRecord to standard WorkItem to open modal
  const handleOpenDetail = (record: TranslatedWorkRecord) => {
    const syntheticWork: WorkItem = {
      id: Number(String(record.id).replace(/[^0-9]/g, '')) || 0,
      source_id: record.rjCode || `RJ${record.id}`,
      title: record.originalTitle,
      name: record.circle || '',
      vas: record.vas
        ? record.vas.split(',').map((v, idx) => ({ id: String(idx), name: v.trim() }))
        : [],
      thumbnailCoverUrl: record.coverUrl,
      mainCoverUrl: record.coverUrl,
      samCoverUrl: record.coverUrl,
      dl_count: 0,
      price: 0,
      rate_average_2dp: 0,
      rate_count: 0,
      release: record.translatedAt ? new Date(record.translatedAt).toISOString().split('T')[0] : '',
      review_count: 0,
      has_subtitle: false,
    };
    onSelectWork(syntheticWork);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in">
      {/* Top Banner / Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950/80 to-slate-900 border border-indigo-500/20 shadow-2xl p-6 sm:p-8">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span>Permanent Server Vault &bull; Detached Translated Library</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <span>Translated Works</span>
              <span className="text-xs px-2.5 py-1 rounded-md bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 font-mono">
                {vaultStats.totalWorks} Works
              </span>
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Every work translated client-side with Google Gemini is permanently saved in the server vault and detached here.
              Browse translated audio dramas, view localized tracklists in English and Vietnamese, and download playlists with zero API quota consumption.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
              title="Refresh translated vault list"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh Vault</span>
            </button>
            <button
              onClick={onNavigateToBrowse}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-bold shadow-lg shadow-red-950/40 transition cursor-pointer"
            >
              <span>Browse All Works</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-slate-800/80">
          <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              Total Translated Works
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white mt-1">
              {vaultStats.totalWorks}
            </div>
          </div>
          <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
              <span>🇬🇧</span>
              English Translations
            </div>
            <div className="text-xl sm:text-2xl font-bold text-blue-400 mt-1">
              {vaultStats.enWorksCount}
            </div>
          </div>
          <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
              <span>🇻🇳</span>
              Vietnamese Translations
            </div>
            <div className="text-xl sm:text-2xl font-bold text-rose-400 mt-1">
              {vaultStats.viWorksCount}
            </div>
          </div>
          <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              Total Cached Titles
            </div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-400 mt-1">
              {vaultStats.totalTitlesCached}
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900/80 backdrop-blur border border-slate-800 rounded-xl p-3 sm:p-4">
        {/* Language Tabs */}
        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700/60 overflow-x-auto">
          <button
            type="button"
            onClick={() => setLangFilter('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              langFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Languages ({vaultStats.totalWorks})
          </button>
          <button
            type="button"
            onClick={() => setLangFilter('en')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              langFilter === 'en'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🇬🇧 English</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-900/60 text-blue-200">
              {vaultStats.enWorksCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setLangFilter('vi')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              langFilter === 'vi'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🇻🇳 Tiếng Việt</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-red-900/60 text-red-200">
              {vaultStats.viWorksCount}
            </span>
          </button>
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search translated RJ, title, circle, VA..."
            className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-20 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <button
            type="submit"
            className="absolute right-1.5 top-1.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
          >
            Search
          </button>
        </form>
      </div>

      {/* Works List / Grid */}
      {loading ? (
        <div className="py-24 text-center space-y-4">
          <div className="w-12 h-12 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin mx-auto" />
          <p className="text-sm text-slate-400 font-medium">Loading permanent translated vault works...</p>
        </div>
      ) : works.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto text-indigo-400">
            <Sparkles className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-lg font-bold text-white">
              {searchQuery ? 'No Matching Works in Vault' : 'No Translated Works Yet'}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {searchQuery
                ? `No works in the permanent vault matched "${searchQuery}". Try searching with a different RJ code or keyword.`
                : 'When you or any user translates titles and tracks client-side with Google Gemini, they are permanently stored in the server vault and detached here into the Translated Library.'}
            </p>
          </div>
          <div className="flex justify-center gap-3 pt-2">
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  loadVaultWorks(langFilter, '');
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                Clear Search
              </button>
            )}
            <button
              type="button"
              onClick={onNavigateToBrowse}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer flex items-center gap-2"
            >
              <span>Browse Works to Translate</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {works.map((item) => {
            const hasEn = Boolean(item.translatedTitle?.en);
            const hasVi = Boolean(item.translatedTitle?.vi);

            // Determine preferred display title
            let displayTitle = item.originalTitle;
            if (langFilter === 'vi' && hasVi) {
              displayTitle = item.translatedTitle.vi!;
            } else if (langFilter === 'en' && hasEn) {
              displayTitle = item.translatedTitle.en!;
            } else if (displayMode === 'vi' && hasVi) {
              displayTitle = item.translatedTitle.vi!;
            } else if (displayMode === 'en' && hasEn) {
              displayTitle = item.translatedTitle.en!;
            } else if (hasEn) {
              displayTitle = item.translatedTitle.en!;
            } else if (hasVi) {
              displayTitle = item.translatedTitle.vi!;
            }

            const trackCountStr = item.totalTracksCount
              ? `${item.translatedTracksCount}/${item.totalTracksCount} tracks translated`
              : `${item.translatedTracksCount} tracks translated`;

            const dateStr = item.translatedAt
              ? new Date(item.translatedAt).toLocaleDateString()
              : '';

            return (
              <div
                key={item.rjCode || String(item.id)}
                className="group relative flex flex-col justify-between bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-indigo-500/50 rounded-2xl overflow-hidden shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-indigo-950/30"
              >
                <div>
                  {/* Cover & Badges */}
                  <div className="relative aspect-[16/10] bg-slate-950 overflow-hidden">
                    {item.coverUrl ? (
                      <img
                        src={item.coverUrl}
                        alt={displayTitle}
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600 bg-slate-900">
                        <Music className="w-12 h-12" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />

                    {/* RJ Badge */}
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-red-600/90 text-white font-mono font-bold text-[11px] shadow">
                        {item.rjCode}
                      </span>
                    </div>

                    {/* Language badges */}
                    <div className="absolute top-3 right-3 flex items-center gap-1">
                      {hasEn && (
                        <span className="px-1.5 py-0.5 rounded-md bg-blue-600/90 text-white font-bold text-[10px] shadow">
                          🇬🇧 EN
                        </span>
                      )}
                      {hasVi && (
                        <span className="px-1.5 py-0.5 rounded-md bg-rose-600/90 text-white font-bold text-[10px] shadow">
                          🇻🇳 VI
                        </span>
                      )}
                    </div>

                    {/* Tracks count badge */}
                    <div className="absolute bottom-2 left-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold backdrop-blur-sm">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        {trackCountStr}
                      </span>
                    </div>
                  </div>

                  {/* Title & Metadata */}
                  <div className="p-4 space-y-2.5">
                    <div>
                      <h3
                        onClick={() => handleOpenDetail(item)}
                        className="font-bold text-sm text-slate-100 hover:text-indigo-300 line-clamp-2 cursor-pointer transition"
                        title={displayTitle}
                      >
                        {displayTitle}
                      </h3>
                      {item.originalTitle && displayTitle !== item.originalTitle && (
                        <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5" title={item.originalTitle}>
                          Orig: {item.originalTitle}
                        </p>
                      )}
                    </div>

                    {/* Circle and CVs */}
                    <div className="space-y-1 text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                      {item.circle && (
                        <div className="flex items-center gap-1.5 line-clamp-1">
                          <span className="text-slate-500 font-medium">Circle:</span>
                          <span className="text-slate-300 font-semibold truncate">{item.circle}</span>
                        </div>
                      )}
                      {item.vas && (
                        <div className="flex items-center gap-1.5 line-clamp-1">
                          <span className="text-slate-500 font-medium">CV:</span>
                          <span className="text-slate-300 truncate">{item.vas}</span>
                        </div>
                      )}
                      {dateStr && (
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <Clock className="w-3 h-3" />
                          <span>Vault Entry: {dateStr}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="p-4 pt-0 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenDetail(item)}
                    className="flex-1 py-2 px-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-indigo-100 border border-indigo-500/30 text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>View Tracks</span>
                  </button>

                  <a
                    href={`/api/download/playlist.m3u?id=${encodeURIComponent(String(item.id || item.rjCode))}`}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs transition cursor-pointer"
                    title="Download M3U playlist"
                  >
                    <ListMusic className="w-4 h-4 text-emerald-400" />
                  </a>

                  <a
                    href={`/classic/work/${encodeURIComponent(item.rjCode || String(item.id))}?trans=en`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs transition cursor-pointer"
                    title="Open in Opera Mini / Symbian classic mode"
                  >
                    <ExternalLink className="w-4 h-4 text-rose-400" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
