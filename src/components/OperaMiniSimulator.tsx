import React, { useState, useRef } from 'react';
import {
  X,
  ExternalLink,
  RotateCw,
  Image,
  ImageOff,
  Signal,
  BatteryMedium,
  Radio,
  ChevronUp,
  ChevronDown,
  Info,
} from 'lucide-react';

interface OperaMiniSimulatorProps {
  onClose: () => void;
  initialWorkId?: number;
}

export const OperaMiniSimulator: React.FC<OperaMiniSimulatorProps> = ({
  onClose,
  initialWorkId,
}) => {
  const [imgMode, setImgMode] = useState<'0' | '1' | '2'>('1');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const initialUrl = initialWorkId
    ? `/classic/work/${initialWorkId}?img=${imgMode}`
    : `/classic?img=${imgMode}`;

  const [currentUrl, setCurrentUrl] = useState<string>(initialUrl);

  const handleReload = () => {
    if (iframeRef.current) {
      iframeRef.current.src = currentUrl;
    }
  };

  const handleScroll = (deltaY: number) => {
    try {
      if (iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.scrollBy({ top: deltaY, behavior: 'smooth' });
      }
    } catch {
      // In case of any cross-origin restriction
    }
  };

  const handleModeChange = (mode: '0' | '1' | '2') => {
    setImgMode(mode);
    let newUrl = currentUrl;
    if (newUrl.includes('img=')) {
      newUrl = newUrl.replace(/img=[0-2]/, `img=${mode}`);
    } else {
      newUrl += (newUrl.includes('?') ? '&' : '?') + `img=${mode}`;
    }
    setCurrentUrl(newUrl);
    if (iframeRef.current) {
      iframeRef.current.src = newUrl;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Simulator Modal Header */}
        <div className="p-3.5 bg-slate-800 border-b border-slate-700 flex items-center justify-between text-xs text-slate-200">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-red-500 animate-pulse" />
            <span className="font-bold text-white text-sm">Nokia Symbian &amp; Opera Mini Live Simulator</span>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition flex items-center gap-1"
              title="Open full page in new tab"
            >
              <span>Full Tab</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Controls Toolbar */}
        <div className="bg-slate-850 px-4 py-2 bg-slate-800/50 border-b border-slate-700/60 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Data Saver:</span>
            <div className="flex rounded-lg bg-slate-800 border border-slate-700 p-0.5">
              <button
                type="button"
                onClick={() => handleModeChange('0')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                  imgMode === '0' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Extreme 2G Data Saver (Zero images)"
              >
                <ImageOff className="w-3 h-3" />
                <span>Text Only</span>
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('1')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                  imgMode === '1' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="240x240 Thumbnails (QVGA Phone standard)"
              >
                <Image className="w-3 h-3" />
                <span>240px QVGA</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReload}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs flex items-center gap-1 cursor-pointer"
            >
              <RotateCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Interactive Nokia Phone Chassis */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center bg-slate-950/80">
          <div className="w-[320px] bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 border-4 border-slate-600 rounded-[38px] p-4 shadow-2xl flex flex-col items-center">
            {/* Phone Speaker & Front Camera */}
            <div className="w-full flex items-center justify-between px-6 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-600" />
              <div className="w-16 h-1.5 rounded-full bg-slate-900 border border-slate-600" />
              <span className="text-[9px] font-black text-slate-400 tracking-wider">NOKIA</span>
            </div>

            {/* Screen Bezel */}
            <div className="w-[260px] h-[340px] bg-black rounded-lg overflow-hidden border-2 border-slate-800 flex flex-col shadow-inner">
              {/* Symbian Status Bar */}
              <div className="bg-slate-800 text-white px-2 py-0.5 flex items-center justify-between text-[10px] font-mono select-none">
                <div className="flex items-center gap-1">
                  <Signal className="w-3 h-3 text-emerald-400" />
                  <span className="text-slate-300 font-bold">3.5G</span>
                </div>
                <span className="text-slate-300">Opera Mini 7.1</span>
                <div className="flex items-center gap-1">
                  <BatteryMedium className="w-3 h-3 text-emerald-400" />
                </div>
              </div>

              {/* Opera Mini Red Header inside Phone */}
              <div className="bg-red-700 text-white px-2 py-1 flex items-center justify-between text-[11px] font-bold border-b border-red-800">
                <div className="flex items-center gap-1 truncate">
                  <div className="w-3.5 h-3.5 rounded-full bg-white text-red-700 flex items-center justify-center font-black text-[9px]">
                    O
                  </div>
                  <span className="truncate">RetroASMR Lite</span>
                </div>
                <span className="text-[9px] bg-red-800 px-1 rounded">240&times;320</span>
              </div>

              {/* Live Pure Server Rendered Iframe */}
              <iframe
                ref={iframeRef}
                src={currentUrl}
                title="Live Symbian Opera Mini Frame"
                className="w-full flex-1 border-0 bg-white"
              />
            </div>

            {/* Softkeys & 5-Way D-Pad Keypad */}
            <div className="w-full mt-3 px-3 flex flex-col items-center">
              {/* Softkey row */}
              <div className="w-full flex items-center justify-between text-[10px] text-slate-300 font-bold mb-1">
                <button
                  onClick={() => handleScroll(-120)}
                  className="px-2 py-0.5 rounded bg-slate-700 active:bg-slate-600 border border-slate-600 cursor-pointer"
                >
                  Options
                </button>
                <button
                  onClick={() => {
                    if (iframeRef.current) iframeRef.current.src = `/classic?img=${imgMode}`;
                  }}
                  className="px-2 py-0.5 rounded bg-slate-700 active:bg-slate-600 border border-slate-600 cursor-pointer"
                >
                  Home
                </button>
              </div>

              {/* D-Pad */}
              <div className="relative w-20 h-20 bg-slate-800 rounded-full border-2 border-slate-600 flex items-center justify-center my-1 shadow-md">
                <button
                  onClick={() => handleScroll(-100)}
                  className="absolute top-1 text-slate-300 hover:text-white active:scale-95 cursor-pointer"
                  title="Scroll Up"
                >
                  <ChevronUp className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handleScroll(100)}
                  className="absolute bottom-1 text-slate-300 hover:text-white active:scale-95 cursor-pointer"
                  title="Scroll Down"
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
                <button
                  onClick={handleReload}
                  className="w-8 h-8 rounded-full bg-slate-700 border border-slate-500 active:bg-red-600 text-white font-bold text-[9px] flex items-center justify-center cursor-pointer shadow"
                >
                  OK
                </button>
              </div>

              {/* Call / End Buttons */}
              <div className="w-full flex items-center justify-between px-2 text-[11px] font-bold mt-1">
                <div className="w-7 h-3 rounded-full bg-emerald-600/80 border border-emerald-500" />
                <span className="text-[9px] text-slate-400 font-sans">Series 60</span>
                <div className="w-7 h-3 rounded-full bg-red-600/80 border border-red-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Technical Note */}
        <div className="p-3 bg-slate-800 border-t border-slate-700 text-xs text-slate-400 flex items-center gap-2">
          <Info className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>
            The view inside the simulator is pure server-side rendered HTML sent with no client-side JS dependency. Any Opera Mini proxy or Symbian browser parses and executes it cleanly!
          </span>
        </div>
      </div>
    </div>
  );
};
