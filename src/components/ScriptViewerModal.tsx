import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Download, Type, FileText } from 'lucide-react';
import { getDownloadProxyUrl } from '../services/api';

interface ScriptViewerModalProps {
  title: string;
  textUrl: string;
  onClose: () => void;
}

export const ScriptViewerModal: React.FC<ScriptViewerModalProps> = ({
  title,
  textUrl,
  onClose,
}) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fontSize, setFontSize] = useState<number>(14);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(textUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.text();
      })
      .then((data) => {
        if (isMounted) {
          setContent(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to fetch script');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [textUrl]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lineCount = content ? content.split('\n').length : 0;
  const charCount = content ? content.length : 0;
  const downloadUrl = getDownloadProxyUrl(textUrl, title);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 truncate">
            <FileText className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="truncate">
              <h3 className="font-bold text-white text-sm truncate" title={title}>
                {title}
              </h3>
              <p className="text-[11px] text-slate-400">
                {lineCount} lines &bull; {charCount.toLocaleString()} characters
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Font size adjustments */}
            <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-700 text-xs text-slate-300">
              <Type className="w-3.5 h-3.5 text-slate-500" />
              <button
                onClick={() => setFontSize((s) => Math.max(s - 1, 11))}
                className="px-1.5 hover:text-white font-bold cursor-pointer"
                title="Decrease font size"
              >
                -
              </button>
              <span className="text-[11px] font-mono w-4 text-center">{fontSize}</span>
              <button
                onClick={() => setFontSize((s) => Math.min(s + 1, 24))}
                className="px-1.5 hover:text-white font-bold cursor-pointer"
                title="Increase font size"
              >
                +
              </button>
            </div>

            {/* Copy button */}
            <button
              onClick={handleCopy}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition cursor-pointer flex items-center gap-1 text-xs"
              title="Copy all text"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {/* Download button */}
            <a
              href={downloadUrl}
              download={title}
              className="p-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition flex items-center gap-1 text-xs"
              title="Download text file"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Save</span>
            </a>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Text Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950/60 font-mono text-slate-200">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-2">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">Loading script...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-950/40 border border-red-800 rounded-xl text-red-300 text-xs">
              Failed to load text: {error}
            </div>
          )}

          {!loading && !error && (
            <pre
              style={{ fontSize: `${fontSize}px` }}
              className="whitespace-pre-wrap break-words leading-relaxed select-text font-mono"
            >
              {content || 'File is empty.'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
