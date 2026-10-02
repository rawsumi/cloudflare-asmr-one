import React from 'react';
import { X, Smartphone, Radio, ShieldCheck, Zap, Server, FileAudio, ExternalLink } from 'lucide-react';

interface RetroExplainModalProps {
  onClose: () => void;
}

export const RetroExplainModal: React.FC<RetroExplainModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-200 text-xs sm:text-sm">
        {/* Header */}
        <div className="p-4 sm:p-6 bg-slate-850 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center text-white font-black text-lg shadow-md">
              O
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                Symbian OS &amp; Opera Mini Compatibility Architecture
              </h2>
              <p className="text-xs text-slate-400">
                How RetroASMR guarantees 100% backward compatibility on vintage devices
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 leading-relaxed">
          {/* Card 1 */}
          <div className="bg-slate-800/50 border border-slate-700/80 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
              <Server className="w-5 h-5 text-red-400" />
              <span>1. Zero-JS Server-Side Rendering (SSR)</span>
            </div>
            <p className="text-slate-300">
              Opera Mini on Symbian (S60v3, S60v5, Symbian^3) does not run JavaScript on the handset. Instead, web requests pass through Opera's transcoding servers (e.g., <code className="text-red-300">server4.operamini.net</code>), which snapshot the page and convert HTML into OBML (Opera Binary Markup Language). Modern React single-page apps (SPAs) fail completely because client-side JS hydration is unsupported.
            </p>
            <p className="text-slate-400">
              Our <code className="text-white font-mono bg-slate-900 px-1 py-0.5 rounded">/classic</code> engine produces pure HTML4/HTML5 transitional output with native <code className="text-white">&lt;form method="GET"&gt;</code> and plain hyperlinks. It requires <strong>0 KB of JavaScript</strong> to search, explore folders, and download files.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-slate-800/50 border border-slate-700/80 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
              <Zap className="w-5 h-5 text-amber-400" />
              <span>2. Resumable Downloads (HTTP Range Support)</span>
            </div>
            <p className="text-slate-300">
              Older 2G GPRS and 3G EDGE networks suffer from high packet loss and intermittent disconnects. The native Symbian Download Manager relies on the <code className="text-amber-300">Range: bytes=X-Y</code> header to resume aborted downloads.
            </p>
            <p className="text-slate-400">
              Our download proxy at <code className="text-white font-mono bg-slate-900 px-1 py-0.5 rounded">/api/download/file</code> forwards Range requests upstream and responds with <code className="text-white">206 Partial Content</code>, allowing Symbian phones to pause and resume multi-hundred megabyte audio tracks seamlessly.
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-slate-800/50 border border-slate-700/80 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
              <Radio className="w-5 h-5 text-emerald-400" />
              <span>3. Symbian RealPlayer &amp; CorePlayer .M3U Streaming</span>
            </div>
            <p className="text-slate-300">
              Classic Nokia phones (such as the Nokia N95, E71, 5800 XpressMusic, and N8) cannot stream audio directly inside web browsers without Flash or modern HTML5 audio. However, Symbian's built-in <strong>RealPlayer</strong> and the popular <strong>CorePlayer</strong> natively support <code className="text-emerald-300">.m3u</code> playlist files over HTTP.
            </p>
            <p className="text-slate-400">
              Clicking <code className="text-white">[RealPlayer M3U]</code> generates a standards-compliant Extended M3U playlist file with individual track titles and durations. Opening this file launches RealPlayer, which buffers and streams all tracks in order without consuming phone storage!
            </p>
          </div>

          {/* Card 4 */}
          <div className="bg-slate-800/50 border border-slate-700/80 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
              <ShieldCheck className="w-5 h-5 text-blue-400" />
              <span>4. TLS &amp; Expired Root Certificate Mitigation</span>
            </div>
            <p className="text-slate-300">
              Many Symbian devices have legacy certificate stores where modern root certificates (like DST Root CA X3 or modern Cloudflare TLS 1.3 handshakes) are not recognized or fail during direct HTTPS socket handshakes.
            </p>
            <p className="text-slate-400">
              By proxying requests through our backend service, the server negotiates upstream TLS with Cloudflare/ASMR.one while presenting clean, compliant HTTP/1.1 streams to older clients.
            </p>
          </div>

          {/* Quick links */}
          <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-800">
            <span className="text-slate-400">Direct engine link:</span>
            <a
              href="/classic"
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-400 hover:text-red-300 font-bold flex items-center gap-1 underline"
            >
              <span>Visit /classic (Opera Mini SSR Home)</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
