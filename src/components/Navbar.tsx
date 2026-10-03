import React from 'react';
import { Radio, Smartphone, Info, ExternalLink, Zap, Terminal, Music, Languages, Sparkles } from 'lucide-react';
import { useTitleTranslation } from '../services/titleTranslationCache';

interface NavbarProps {
  onOpenSimulator: () => void;
  onOpenGuide: () => void;
  onOpenTranslator: () => void;
  quickRj: string;
  setQuickRj: (val: string) => void;
  onSearchRj: (rj: string) => void;
  currentView?: 'browse' | 'translated';
  onNavigateView?: (view: 'browse' | 'translated') => void;
  vaultWorksCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenSimulator,
  onOpenGuide,
  onOpenTranslator,
  quickRj,
  setQuickRj,
  onSearchRj,
  currentView = 'browse',
  onNavigateView,
  vaultWorksCount,
}) => {
  const { displayMode, setDisplayMode, stats } = useTitleTranslation();

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickRj.trim()) {
      onSearchRj(quickRj.trim());
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Logo and branding */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 via-rose-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-red-950/40 text-white font-black text-xl tracking-tighter">
            O
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                RetroASMR
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                <Radio className="w-3 h-3 text-red-400 animate-pulse" />
                Opera Mini &amp; Symbian Engine
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Universal ASMR.one Downloader &amp; Backward-Compatible Search
            </p>
          </div>
        </div>

        {/* View Switcher: Browse Catalog vs Translated Vault */}
        {onNavigateView && (
          <div className="flex items-center p-1 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-inner">
            <button
              type="button"
              onClick={() => onNavigateView('browse')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                currentView === 'browse'
                  ? 'bg-slate-700 text-white shadow-sm font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Browse</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateView('translated')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                currentView === 'translated'
                  ? 'bg-indigo-600 text-white shadow-sm font-bold'
                  : 'text-indigo-300 hover:text-indigo-100'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Translated</span>
              {vaultWorksCount !== undefined && vaultWorksCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-500/40 text-white font-bold">
                  {vaultWorksCount}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Quick RJ Lookup Form */}
        <form onSubmit={handleQuickSubmit} className="hidden md:flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Jump to RJ01632573..."
              value={quickRj}
              onChange={(e) => setQuickRj(e.target.value)}
              className="w-44 lg:w-56 bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition"
            />
          </div>
          <button
            type="submit"
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition cursor-pointer"
          >
            Jump
          </button>
        </form>

        {/* Action buttons */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Manual Title & Track Translator trigger */}
          <button
            type="button"
            onClick={onOpenTranslator}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600/30 to-purple-600/30 hover:from-indigo-600/50 hover:to-purple-600/50 text-indigo-200 border border-indigo-500/40 text-xs font-bold transition cursor-pointer shadow-sm"
            title="Manually select titles and tracks to translate to English or Vietnamese (with cache)"
          >
            <Languages className="w-4 h-4 text-indigo-400" />
            <span className="hidden sm:inline">Translate Titles</span>
            <span className="sm:hidden">Translate</span>
            {stats.total > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-500/40 text-white font-semibold">
                {stats.total}
              </span>
            )}
          </button>

          {/* Quick Display Language Toggle */}
          <div className="hidden lg:inline-flex items-center p-0.5 rounded-lg bg-slate-800/90 border border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setDisplayMode('original')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                displayMode === 'original'
                  ? 'bg-slate-700 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="View original Japanese/Chinese titles"
            >
              Orig
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('en')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                displayMode === 'en'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Display titles in English"
            >
              🇬🇧 EN
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('vi')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                displayMode === 'vi'
                  ? 'bg-red-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Hiển thị tiêu đề Tiếng Việt"
            >
              🇻🇳 VI
            </button>
          </div>

          {/* Simulator button */}
          <button
            onClick={onOpenSimulator}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition cursor-pointer"
            title="Open Interactive Symbian & Opera Mini Device Simulator"
          >
            <Smartphone className="w-4 h-4 text-indigo-400" />
            <span className="hidden xl:inline">Symbian Simulator</span>
          </button>

          {/* Opera Mini Mode direct link */}
          <a
            href="/classic"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md shadow-red-950/30 transition cursor-pointer"
            title="Open pure server-rendered HTML version (Zero JavaScript required)"
          >
            <Zap className="w-4 h-4" />
            <span className="hidden sm:inline">Opera Mini Mode</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>

          {/* Guide / About */}
          <button
            onClick={onOpenGuide}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition cursor-pointer"
            title="Symbian OS & Opera Mini Compatibility Info"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

