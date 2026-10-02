import React from 'react';
import { Radio, Smartphone, Info, ExternalLink, Zap, Terminal, Music } from 'lucide-react';

interface NavbarProps {
  onOpenSimulator: () => void;
  onOpenGuide: () => void;
  quickRj: string;
  setQuickRj: (val: string) => void;
  onSearchRj: (rj: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenSimulator,
  onOpenGuide,
  quickRj,
  setQuickRj,
  onSearchRj,
}) => {
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

        {/* Quick RJ Lookup Form */}
        <form onSubmit={handleQuickSubmit} className="hidden md:flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Jump to RJ01632573..."
              value={quickRj}
              onChange={(e) => setQuickRj(e.target.value)}
              className="w-48 lg:w-60 bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition"
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
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Simulator button */}
          <button
            onClick={onOpenSimulator}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition cursor-pointer"
            title="Open Interactive Symbian & Opera Mini Device Simulator"
          >
            <Smartphone className="w-4 h-4 text-indigo-400" />
            <span className="hidden sm:inline">Symbian Simulator</span>
            <span className="sm:hidden">Simulator</span>
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
            <span className="hidden sm:inline">Open Opera Mini Mode</span>
            <span className="sm:hidden">Lite Mode</span>
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
