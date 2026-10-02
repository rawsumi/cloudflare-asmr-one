import React from 'react';
import { Search, Sparkles, Filter, SlidersHorizontal, X, ArrowUpDown, Subtitles, HelpCircle, Globe } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../services/api';

interface SearchHeaderProps {
  query: string;
  setQuery: (val: string) => void;
  onSearch: (e?: React.FormEvent) => void;
  order: string;
  setOrder: (val: string) => void;
  sort: string;
  setSort: (val: string) => void;
  hasSubtitle: boolean;
  setHasSubtitle: (val: boolean) => void;
  lang: string;
  setLang: (val: string) => void;
  loading: boolean;
  totalCount: number;
}

const PRESETS = [
  { label: 'Example: RJ01632573', value: 'RJ01632573' },
  { label: 'Whisper (ささやき)', value: 'whisper' },
  { label: 'Ear Cleaning (耳かき)', value: 'ear cleaning' },
  { label: 'KU100 Binaural', value: 'KU100' },
  { label: 'Rain / Ambience', value: 'rain' },
  { label: 'Heartbeat (心音)', value: 'heartbeat' },
];

export const SearchHeader: React.FC<SearchHeaderProps> = ({
  query,
  setQuery,
  onSearch,
  order,
  setOrder,
  sort,
  setSort,
  hasSubtitle,
  setHasSubtitle,
  lang,
  setLang,
  loading,
  totalCount,
}) => {
  return (
    <div className="bg-slate-900/60 border-b border-slate-800/80 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Retro Compatibility Banner */}
        <div className="bg-gradient-to-r from-red-950/40 via-slate-900 to-indigo-950/40 border border-red-500/20 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping inline-block" />
            <span>
              <strong className="text-white">Symbian OS &amp; Opera Mini Ready:</strong> Full support for Nokia N95/5800/E71, zero-JS HTML server rendering, resume-enabled file downloads &amp; RealPlayer <code className="text-red-300 bg-red-950/60 px-1 py-0.5 rounded">.m3u</code> streaming.
            </span>
          </div>
          <a
            href="/classic"
            target="_blank"
            rel="noopener noreferrer"
            className="text-red-400 hover:text-red-300 font-semibold underline underline-offset-2 shrink-0 flex items-center gap-1"
          >
            Switch to /classic &rarr;
          </a>
        </div>

        {/* Search input form */}
        <form onSubmit={onSearch} className="relative flex items-center shadow-2xl">
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search RJ code (e.g. RJ01632573), voice actor, circle, or keyword..."
              className="w-full pl-12 pr-12 py-3.5 bg-slate-800/90 border border-slate-700 rounded-2xl text-slate-100 placeholder-slate-400 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition shadow-inner"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="ml-3 px-5 sm:px-7 py-3.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold rounded-2xl text-sm transition shadow-lg shadow-red-950/40 shrink-0 cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Search</span>
          </button>
        </form>

        {/* Quick presets */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          <span className="text-slate-400 shrink-0 font-medium mr-1 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Suggestions:
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => {
                setQuery(p.value);
              }}
              className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white rounded-lg border border-slate-700/60 transition shrink-0 cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Filters and sorting row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs border-t border-slate-800">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Language Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 flex items-center gap-1 font-medium">
                <Globe className="w-3.5 h-3.5 text-indigo-400" /> Lang:
              </span>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-red-500 font-medium"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.flag} {l.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Order */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400 flex items-center gap-1 font-medium">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" /> Sort by:
              </span>
              <select
                value={order}
                onChange={(e) => setOrder(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                <option value="dl_count">Popular (Downloads)</option>
                <option value="release">Release Date</option>
                <option value="rating">Rating (Average)</option>
                <option value="review_count">Reviews Count</option>
                <option value="price">Price</option>
              </select>
            </div>

            {/* Sort Direction */}
            <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded-lg border border-slate-700">
              <button
                type="button"
                onClick={() => setSort('desc')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  sort === 'desc' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Desc &darr;
              </button>
              <button
                type="button"
                onClick={() => setSort('asc')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  sort === 'asc' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Asc &uarr;
              </button>
            </div>

            {/* Subtitle Filter */}
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white select-none">
              <input
                type="checkbox"
                checked={hasSubtitle}
                onChange={(e) => setHasSubtitle(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-red-600 focus:ring-red-500/50"
              />
              <Subtitles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Subtitles only</span>
            </label>
          </div>

          <div className="text-slate-400 text-xs">
            {totalCount > 0 && <span>Found <strong className="text-slate-200">{totalCount}</strong> works</span>}
          </div>
        </div>
      </div>
    </div>
  );
};
