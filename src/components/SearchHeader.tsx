import React, { useState } from 'react';
import { Search, Sparkles, Filter, SlidersHorizontal, X, ArrowUpDown, Subtitles, HelpCircle, Globe, Tag, ChevronDown, ChevronUp, Clock, Flame, Star, Shield, AlertTriangle } from 'lucide-react';
import { SUPPORTED_LANGUAGES, POPULAR_TAGS, AsmrTag } from '../services/api';

interface SearchHeaderProps {
  query: string;
  setQuery: (val: string) => void;
  onSearch: (e?: React.FormEvent, customQuery?: string) => void;
  order: string;
  setOrder: (val: string) => void;
  sort: string;
  setSort: (val: string) => void;
  hasSubtitle: boolean;
  setHasSubtitle: (val: boolean) => void;
  lang: string;
  setLang: (val: string) => void;
  tag: string;
  setTag: (val: string) => void;
  nsfw: string;
  setNsfw: (val: string) => void;
  autoTranslateLang?: string;
  setAutoTranslateLang?: (val: string) => void;
  loading: boolean;
  totalCount: number;
}

const PRESETS = [
  { label: '👂 耳かき (Ear Clean)', value: '耳かき' },
  { label: '🤫 囁き (Whisper)', value: '囁き' },
  { label: '👅 耳舐め (Ear Licking 18+)', value: '耳舐め' },
  { label: '🔥 オナサポート (Guided 18+)', value: 'オナサポート' },
  { label: '💤 安眠 (Sleep Aid)', value: '安眠' },
  { label: '💖 純愛 (Pure Love)', value: '純愛' },
  { label: '🎙️ KU100 Binaural', value: 'KU100' },
  { label: 'Example: RJ01632573', value: 'RJ01632573' },
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
  tag,
  setTag,
  nsfw,
  setNsfw,
  autoTranslateLang,
  setAutoTranslateLang,
  loading,
  totalCount,
}) => {
  const [isTagDrawerOpen, setIsTagDrawerOpen] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [tagRatingFilter, setTagRatingFilter] = useState<'all' | 'sfw' | 'nsfw'>('all');

  const activeTagObj = POPULAR_TAGS.find(
    (t) => t.name === tag || t.id === tag || t.jp === tag || t.zh === tag || t.en.toLowerCase() === tag.toLowerCase()
  );

  const filteredTags = POPULAR_TAGS.filter((t) => {
    if (tagRatingFilter !== 'all' && t.rating !== tagRatingFilter) return false;
    if (!tagSearchQuery.trim()) return true;
    const q = tagSearchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.jp.toLowerCase().includes(q) ||
      t.zh.toLowerCase().includes(q) ||
      t.en.toLowerCase().includes(q)
    );
  });

  const categories: Array<'Triggers' | 'Mood' | 'Character' | 'Tech' | 'NSFW' | 'Fetish'> = [
    'Triggers',
    'Mood',
    'Character',
    'Tech',
    'NSFW',
    'Fetish',
  ];

  const getCategoryTitle = (cat: string) => {
    switch (cat) {
      case 'Triggers':
        return '👂 ASMR Sound Triggers & Sensations';
      case 'Mood':
        return '💤 Relaxation, Mood & Scenarios';
      case 'Character':
        return '👩 Character Archetypes & Roles';
      case 'Tech':
        return '🎙️ Microphones & 3D Spatial Audio';
      case 'NSFW':
        return '🔞 18+ Adult Sensations & Sounds';
      case 'Fetish':
        return '🔥 18+ Adult Tropes & Fetishes';
      default:
        return cat;
    }
  };

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

        {/* Quick View Modes (Recent vs Popular Tabs) */}
        <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setOrder('release');
                setSort('desc');
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                order === 'release' && sort === 'desc'
                  ? 'bg-red-600 text-white font-bold shadow-md shadow-red-950/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-300" />
              <span>Recent Releases</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOrder('dl_count');
                setSort('desc');
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                order === 'dl_count' && sort === 'desc'
                  ? 'bg-red-600 text-white font-bold shadow-md shadow-red-950/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
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
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                order === 'rating' && sort === 'desc'
                  ? 'bg-red-600 text-white font-bold shadow-md shadow-red-950/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
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
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                order === 'create_date' && sort === 'desc'
                  ? 'bg-red-600 text-white font-bold shadow-md shadow-red-950/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Recently Added</span>
            </button>
          </div>

          {/* Age Rating Filter (SFW vs NSFW) */}
          <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setNsfw('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                nsfw === 'all'
                  ? 'bg-slate-700 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Content
            </button>
            <button
              type="button"
              onClick={() => setNsfw('sfw')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
                nsfw === 'sfw'
                  ? 'bg-emerald-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-emerald-300'
              }`}
              title="Show only SFW / All-Ages works"
            >
              <Shield className="w-3 h-3 text-emerald-300" />
              <span>SFW Only</span>
            </button>
            <button
              type="button"
              onClick={() => setNsfw('nsfw')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
                nsfw === 'nsfw'
                  ? 'bg-rose-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-rose-300'
              }`}
              title="Show only 18+ Adult works"
            >
              <AlertTriangle className="w-3 h-3 text-rose-300" />
              <span>18+ Adult</span>
            </button>
          </div>
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

        {/* Active Tag Filter Indicator */}
        {tag && (
          <div className="flex items-center gap-2 text-xs bg-red-950/50 border border-red-500/40 rounded-xl px-3 py-2 text-red-200 animate-in fade-in duration-150">
            <Tag className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>
              Active Tag Filter: <strong className="text-white font-bold">{activeTagObj ? `${activeTagObj.emoji} ${activeTagObj.jp} / ${activeTagObj.en}` : `#${tag}`}</strong>
            </span>
            <button
              type="button"
              onClick={() => setTag('')}
              className="ml-auto px-2 py-0.5 bg-red-600/60 hover:bg-red-600 text-white rounded text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Clear Tag</span>
            </button>
          </div>
        )}

        {/* Quick Tag Row */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-rose-400" />
                <span>Quick ASMR Tags:</span>
              </span>
              <span className="text-[11px] text-slate-500">
                ({POPULAR_TAGS.length} SFW &amp; 18+ tags available)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsTagDrawerOpen(!isTagDrawerOpen)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer transition bg-slate-800/60 hover:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700/60"
            >
              <span>{isTagDrawerOpen ? 'Close Tag Catalog' : 'Browse All ASMR Tags'}</span>
              {isTagDrawerOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            {POPULAR_TAGS.slice(0, 24).map((t) => {
              const isSelected = tag === t.name;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTag(isSelected ? '' : t.name);
                  }}
                  className={`px-2.5 py-1 rounded-lg border transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-red-600 text-white border-red-500 font-bold shadow-md shadow-red-950/40'
                      : t.rating === 'nsfw'
                      ? 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-200 hover:text-white border-rose-800/50'
                      : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border-slate-700/60'
                  }`}
                  title={`${t.en} (${t.zh}) ${t.rating === 'nsfw' ? '[18+]' : ''}`}
                >
                  <span>{t.emoji}</span>
                  <span>{t.jp}</span>
                  {t.rating === 'nsfw' && <span className="text-[9px] bg-rose-900/80 text-rose-300 px-1 rounded">18+</span>}
                  {isSelected && <span className="text-[10px]">&times;</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Collapsible Tag Drawer (Categorized View with SFW & NSFW tabs) */}
        {isTagDrawerOpen && (
          <div className="bg-slate-950/95 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 animate-in fade-in duration-200 shadow-2xl">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={tagSearchQuery}
                  onChange={(e) => setTagSearchQuery(e.target.value)}
                  placeholder="Filter tags by name (e.g. ear, sleep, 舐め, sister)..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700/80 rounded-xl text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              {/* Tag Rating Filter in Drawer */}
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setTagRatingFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer font-medium ${
                    tagRatingFilter === 'all'
                      ? 'bg-slate-750 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All Tags ({POPULAR_TAGS.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTagRatingFilter('sfw')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer font-medium flex items-center gap-1 ${
                    tagRatingFilter === 'sfw'
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'text-slate-400 hover:text-emerald-300'
                  }`}
                >
                  <Shield className="w-3 h-3" />
                  <span>SFW Tags ({POPULAR_TAGS.filter((t) => t.rating === 'sfw').length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTagRatingFilter('nsfw')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer font-medium flex items-center gap-1 ${
                    tagRatingFilter === 'nsfw'
                      ? 'bg-rose-600 text-white font-bold'
                      : 'text-slate-400 hover:text-rose-300'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>18+ Adult Tags ({POPULAR_TAGS.filter((t) => t.rating === 'nsfw').length})</span>
                </button>
              </div>

              {tag && (
                <button
                  type="button"
                  onClick={() => setTag('')}
                  className="text-xs text-red-400 hover:text-red-300 font-semibold cursor-pointer"
                >
                  Clear Active Tag
                </button>
              )}
            </div>

            {categories.map((cat) => {
              const catTags = filteredTags.filter((t) => t.category === cat);
              if (catTags.length === 0) return null;
              return (
                <div key={cat} className="space-y-1.5 pt-1 border-t border-slate-900 first:border-0 first:pt-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400 flex items-center gap-1.5">
                      <span>{getCategoryTitle(cat)}</span>
                      <span className="text-[10px] text-slate-500 font-normal">({catTags.length})</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {catTags.map((t) => {
                      const isSelected = tag === t.name;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setTag(isSelected ? '' : t.name);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs border transition cursor-pointer flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-red-600 text-white border-red-500 font-bold shadow-md'
                              : t.rating === 'nsfw'
                              ? 'bg-rose-950/30 hover:bg-rose-900/50 text-rose-200 hover:text-white border-rose-800/40'
                              : 'bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/60'
                          }`}
                        >
                          <span>{t.emoji}</span>
                          <span>{t.jp}</span>
                          <span className="text-[10px] text-slate-400">({t.en})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
                onSearch(undefined, p.value);
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
                <option value="release">Release Date (Newest first / Recent)</option>
                <option value="create_date">Recently Added to Catalog</option>
                <option value="dl_count">Most Downloaded (All-time Popular)</option>
                <option value="rating">Highest User Rating</option>
                <option value="review_count">Most Reviews Count</option>
                <option value="price">Price</option>
              </select>
            </div>

            {/* Sort Direction */}
            <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded-lg border border-slate-700">
              <button
                type="button"
                onClick={() => setSort('desc')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  sort === 'desc' ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Desc &darr;
              </button>
              <button
                type="button"
                onClick={() => setSort('asc')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  sort === 'asc' ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Asc &uarr;
              </button>
            </div>

            {/* Auto-Translate Titles Filter */}
            <div className="flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-500/40 rounded-lg px-2 py-0.5">
              <span className="text-emerald-300 flex items-center gap-1 font-semibold text-[11px]">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> AI Titles:
              </span>
              <select
                value={autoTranslateLang}
                onChange={(e) => setAutoTranslateLang?.(e.target.value)}
                className="bg-slate-900 border border-emerald-700/60 rounded px-2 py-0.5 text-emerald-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium cursor-pointer"
              >
                <option value="off">Off (Original)</option>
                <option value="en">🇬🇧 English</option>
                <option value="zh-hans">🇨🇳 简体中文</option>
                <option value="zh-hant">🇹🇼 繁體中文</option>
                <option value="ko">🇰🇷 한국어</option>
                <option value="vi">🇻🇳 Tiếng Việt</option>
                <option value="es">🇪🇸 Español</option>
                <option value="fr">🇫🇷 Français</option>
                <option value="de">🇩🇪 Deutsch</option>
                <option value="ru">🇷🇺 Русский</option>
                <option value="id">🇮🇩 Bahasa Indo</option>
                <option value="th">🇹🇭 ไทย</option>
              </select>
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

