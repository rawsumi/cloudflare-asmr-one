import React from 'react';
import { WorkItem } from '../types/asmr';
import { getWorkLanguageInfo } from '../services/api';
import { useTitleTranslation } from '../services/titleTranslationCache';
import { Star, Download, Play, Music, Radio, User, FolderArchive, ExternalLink, Calendar, Globe, Sparkles, Languages } from 'lucide-react';

interface WorkCardProps {
  work: WorkItem;
  onSelectWork: (work: WorkItem) => void;
  onPlayWork: (work: WorkItem) => void;
  onFilterByVa?: (vaName: string) => void;
  onFilterByCircle?: (circleName: string) => void;
  onFilterByTag?: (tagName: string) => void;
  onTranslateWork?: (work: WorkItem) => void;
  activeTag?: string;
}

export const WorkCard: React.FC<WorkCardProps> = ({
  work,
  onSelectWork,
  onPlayWork,
  onFilterByVa,
  onFilterByCircle,
  onFilterByTag,
  onTranslateWork,
  activeTag,
}) => {
  const { getDisplayTitle, displayMode } = useTitleTranslation();
  const rjCode = work.source_id || `RJ${work.id}`;
  const coverUrl = work.thumbnailCoverUrl || work.samCoverUrl || work.mainCoverUrl;
  const vas = work.vas || [];
  const tags = work.tags?.slice(0, 4) || [];
  const langInfo = getWorkLanguageInfo(work);

  const titleDisplay = getDisplayTitle(work.title);

  return (
    <div className="group bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl hover:shadow-red-950/20 transition duration-200 flex flex-col justify-between">
      {/* Upper Content */}
      <div>
        {/* Cover Image & Quick Badges */}
        <div className="relative aspect-[4/3] bg-slate-950 overflow-hidden cursor-pointer" onClick={() => onSelectWork(work)}>
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={work.title}
              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
              loading="lazy"
              onError={(e) => {
                // Fallback to placeholder if cover image fails
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-600">
              <Music className="w-12 h-12" />
            </div>
          )}

          {/* Badges Overlay */}
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-red-600/90 text-white font-black text-[11px] shadow-sm tracking-wide">
              {rjCode}
            </span>
            <span className={`px-1.5 py-0.5 rounded-md font-bold text-[10px] flex items-center gap-1 shadow-sm border ${langInfo.primary.badgeClass}`}>
              <span>{langInfo.primary.flag}</span>
              <span>{langInfo.primary.label}</span>
            </span>
            {titleDisplay.isTranslated && (
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold shadow-sm border flex items-center gap-1 ${
                titleDisplay.lang === 'vi'
                  ? 'bg-red-900/80 text-red-200 border-red-500/50'
                  : 'bg-blue-900/80 text-blue-200 border-blue-500/50'
              }`}>
                <span>{titleDisplay.lang === 'vi' ? '🇻🇳 Dịch' : '🇬🇧 EN'}</span>
              </span>
            )}
            {work.rate_average_2dp ? (
              <span className="px-1.5 py-0.5 rounded-md bg-amber-500/90 text-slate-950 font-bold text-[11px] flex items-center gap-0.5 shadow-sm">
                <Star className="w-3 h-3 fill-current" />
                {work.rate_average_2dp}
              </span>
            ) : null}
          </div>

          {work.dl_count !== undefined && (
            <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-slate-900/80 backdrop-blur text-slate-200 text-[11px] font-semibold flex items-center gap-1">
              <Download className="w-3 h-3 text-slate-400" />
              {work.dl_count.toLocaleString()}
            </div>
          )}

          {/* Quick Play Hover Button */}
          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPlayWork(work);
              }}
              className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition cursor-pointer"
              title="Play audio preview"
            >
              <Play className="w-5 h-5 ml-0.5 fill-current" />
            </button>
          </div>
        </div>

        {/* Work Information */}
        <div className="p-4 space-y-2.5">
          {/* Title */}
          <div>
            <h3
              onClick={() => onSelectWork(work)}
              className="font-bold text-slate-100 text-sm line-clamp-2 leading-snug hover:text-red-400 transition cursor-pointer"
              title={titleDisplay.isTranslated ? `Original: ${work.title}` : work.title}
            >
              {titleDisplay.text}
            </h3>
            {titleDisplay.isTranslated && (
              <p className="text-[11px] text-slate-400 line-clamp-1 italic mt-0.5" title={work.title}>
                Orig: {work.title}
              </p>
            )}
          </div>

          {/* Circle / Author */}
          <div className="text-xs text-slate-400 flex items-center gap-1.5 truncate">
            <span className="text-slate-500">Circle:</span>
            <button
              onClick={() => onFilterByCircle && work.name && onFilterByCircle(work.name)}
              className="text-indigo-400 hover:text-indigo-300 hover:underline font-medium truncate cursor-pointer text-left"
            >
              {work.name || 'Unknown Circle'}
            </button>
          </div>

          {/* Voice Actors */}
          {vas.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap text-[11px]">
              <span className="text-slate-500 flex items-center gap-0.5">
                <User className="w-3 h-3" /> CV:
              </span>
              {vas.map((va) => (
                <button
                  key={va.id || va.name}
                  onClick={() => onFilterByVa && onFilterByVa(va.name)}
                  className="px-1.5 py-0.5 rounded bg-slate-700/80 hover:bg-slate-700 text-slate-200 hover:text-white transition cursor-pointer"
                >
                  {va.name}
                </button>
              ))}
            </div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap pt-0.5">
              {tags.map((t, idx) => {
                const isSelected = activeTag === t.name;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onFilterByTag) onFilterByTag(t.name);
                    }}
                    className={`text-[10px] px-1.5 py-0.5 rounded border transition cursor-pointer flex items-center gap-0.5 ${
                      isSelected
                        ? 'bg-red-600 text-white border-red-500 font-bold shadow-sm'
                        : 'bg-slate-900/60 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700/50'
                    }`}
                    title={`Filter by tag #${t.name}`}
                  >
                    <span>#{t.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Other Language Editions if available */}
          {langInfo.hasMultipleEditions && langInfo.editions.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap pt-0.5 text-[10px]">
              <span className="text-slate-500 flex items-center gap-0.5">
                <Globe className="w-2.5 h-2.5 text-indigo-400" /> Editions:
              </span>
              {langInfo.editions.map((ed) => (
                <button
                  key={ed.workno}
                  onClick={(e) => {
                    e.stopPropagation();
                    const numericId = parseInt(ed.workno.replace(/\D/g, ''), 10);
                    onSelectWork({
                      ...work,
                      id: numericId || work.id,
                      source_id: ed.workno,
                      title: `[${ed.label}] ${work.title}`,
                    });
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 transition cursor-pointer"
                  title={`Open ${ed.label} edition (${ed.workno})`}
                >
                  {ed.label}
                </button>
              ))}
            </div>
          )}

          {/* Release and Price */}
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-700/50">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-500" />
              {work.release || 'Unknown Date'}
            </span>
            {work.price !== undefined && (
              <span className="font-semibold text-slate-300">
                &yen;{work.price.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="p-3 bg-slate-900/60 border-t border-slate-700/60 flex items-center justify-between gap-1.5 text-xs">
        <button
          onClick={() => onSelectWork(work)}
          className="flex-1 py-1.5 px-2 bg-red-600/90 hover:bg-red-600 text-white font-medium rounded-lg transition text-center flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <FolderArchive className="w-3.5 h-3.5" />
          <span>Tracks &amp; Download</span>
        </button>

        {onTranslateWork && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTranslateWork(work);
            }}
            className="p-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded-lg border border-indigo-500/30 transition cursor-pointer"
            title="Translate title and tracks into English / Tiếng Việt"
          >
            <Languages className="w-4 h-4" />
          </button>
        )}

        <a
          href={`/api/download/playlist.m3u?id=${work.id}`}
          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition"
          title="Download RealPlayer / CorePlayer .M3U Playlist"
        >
          <Radio className="w-4 h-4 text-emerald-400" />
        </a>

        <a
          href={`/classic/work/${work.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition"
          title="Open in Classic Opera Mini / Symbian view"
        >
          <ExternalLink className="w-4 h-4 text-slate-400" />
        </a>
      </div>
    </div>
  );
};

