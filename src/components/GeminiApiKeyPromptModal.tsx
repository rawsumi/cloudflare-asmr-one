import React, { useState, useEffect } from 'react';
import {
  Key,
  X,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  Clipboard,
  Shield,
  Zap,
} from 'lucide-react';
import {
  getStoredGeminiApiKey,
  setStoredGeminiApiKey,
} from '../services/clientGeminiTranslator';

interface GeminiApiKeyPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeySaved?: (apiKey: string) => void;
  title?: string;
  description?: string;
}

export const GeminiApiKeyPromptModal: React.FC<GeminiApiKeyPromptModalProps> = ({
  isOpen,
  onClose,
  onKeySaved,
  title = 'Google Gemini API Key Required',
  description = 'To translate voice work titles and track names, you must provide a Google Gemini API key. The translation process is executed client-side in your browser and uploaded to the server cache.',
}) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setApiKey(getStoredGeminiApiKey());
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const cleanKey = apiKey.trim();
    if (!cleanKey) {
      setError('Please enter a valid Google Gemini API Key to proceed.');
      return;
    }

    if (cleanKey.length < 15) {
      setError('The provided API key seems too short. Gemini keys typically start with "AIzaSy..."');
      return;
    }

    setStoredGeminiApiKey(cleanKey);
    setError(null);
    if (onKeySaved) {
      onKeySaved(cleanKey);
    }
    onClose();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setApiKey(text.trim());
        setError(null);
        setCopiedSuccess(true);
        setTimeout(() => setCopiedSuccess(false), 2000);
      }
    } catch {
      // clipboard access not permitted
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700/90 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-start justify-between gap-3 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-950/50">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>{title}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Client-Side AI
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Processed in your browser &amp; cached on the server
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            {description}
          </p>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2 text-xs text-slate-400">
            <div className="flex items-center gap-2 text-slate-200 font-semibold">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>How Client-Side Translation Works:</span>
            </div>
            <ul className="space-y-1 list-disc list-inside text-[11px] text-slate-300 pl-1">
              <li>
                Your Gemini key translates titles directly in your browser (no server rate limits).
              </li>
              <li>
                Newly translated titles are uploaded to the server cache for persistent reuse.
              </li>
              <li>
                Your key is stored locally in your browser's <code className="text-indigo-300 font-mono">localStorage</code>.
              </li>
            </ul>
          </div>

          {/* Key Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                <span>Gemini API Key:</span>
              </label>
              <button
                type="button"
                onClick={handlePaste}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition cursor-pointer"
              >
                <Clipboard className="w-3 h-3" />
                <span>{copiedSuccess ? 'Pasted!' : 'Paste from clipboard'}</span>
              </button>
            </div>

            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setError(null);
                }}
                placeholder="AIzaSy..."
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                title={showKey ? 'Hide API Key' : 'Show API Key'}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-1.5 text-xs text-red-400 pt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* AI Studio Link */}
          <div className="pt-1 flex items-center justify-between text-xs">
            <span className="text-slate-400">Need a free API key?</span>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 hover:underline font-semibold"
            >
              <span>Get Free Key at Google AI Studio</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 bg-slate-950/60 border-t border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/40 transition cursor-pointer flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Save Key &amp; Proceed</span>
          </button>
        </div>
      </div>
    </div>
  );
};
