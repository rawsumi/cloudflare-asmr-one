import { useState, useEffect, useCallback } from 'react';

export type TranslationTargetLang = 'en' | 'vi';
export type TitleDisplayMode = 'original' | 'en' | 'vi';

const CACHE_STORAGE_KEY = 'retroasmr_title_translations_cache_v2';
const DISPLAY_MODE_STORAGE_KEY = 'retroasmr_title_display_mode_v2';

interface StoredCache {
  en: Record<string, string>;
  vi: Record<string, string>;
}

function loadCache(): StoredCache {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(CACHE_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        en: parsed.en || {},
        vi: parsed.vi || {},
      };
    }
  } catch (err) {
    console.warn('Failed to load title translation cache from localStorage:', err);
  }
  return { en: {}, vi: {} };
}

function saveCache(cache: StoredCache): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
    }
  } catch (err) {
    console.warn('Failed to save title translation cache to localStorage:', err);
  }
}

// In-memory runtime mirror of cache for zero-latency lookups
let memoryCache: StoredCache = loadCache();

export function getCachedTitle(original: string, lang: TranslationTargetLang): string | undefined {
  if (!original) return undefined;
  const key = original.trim();
  return memoryCache[lang]?.[key];
}

export function hasCachedTitle(original: string, lang: TranslationTargetLang): boolean {
  if (!original) return false;
  const key = original.trim();
  return !!memoryCache[lang]?.[key];
}

export function setCachedTitles(translations: Record<string, string>, lang: TranslationTargetLang): void {
  let updated = false;
  if (!memoryCache[lang]) memoryCache[lang] = {};

  for (const [orig, trans] of Object.entries(translations)) {
    const cleanOrig = orig.trim();
    const cleanTrans = trans.trim();
    if (cleanOrig && cleanTrans) {
      memoryCache[lang][cleanOrig] = cleanTrans;
      updated = true;
    }
  }

  if (updated) {
    saveCache(memoryCache);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('retroasmr-titles-updated', {
          detail: { lang, count: Object.keys(translations).length },
        })
      );
    }
  }
}

export function getAllCachedTitles(lang: TranslationTargetLang): Record<string, string> {
  return { ...(memoryCache[lang] || {}) };
}

export function clearCachedTitles(): void {
  memoryCache = { en: {}, vi: {} };
  saveCache(memoryCache);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('retroasmr-titles-updated', { detail: { cleared: true } }));
  }
}

export function getTitleCacheStats(): { enCount: number; viCount: number; total: number } {
  const enCount = Object.keys(memoryCache.en || {}).length;
  const viCount = Object.keys(memoryCache.vi || {}).length;
  return {
    enCount,
    viCount,
    total: enCount + viCount,
  };
}

export function getStoredDisplayMode(): TitleDisplayMode {
  try {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(DISPLAY_MODE_STORAGE_KEY);
      if (saved === 'en' || saved === 'vi' || saved === 'original') {
        return saved;
      }
    }
  } catch {}
  return 'original';
}

export function setStoredDisplayMode(mode: TitleDisplayMode): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, mode);
      window.dispatchEvent(
        new CustomEvent('retroasmr-display-mode-updated', {
          detail: { mode },
        })
      );
    }
  } catch {}
}

/**
 * React hook for consuming and updating translated titles reactively
 */
export function useTitleTranslation() {
  const [displayMode, setDisplayModeState] = useState<TitleDisplayMode>(getStoredDisplayMode());
  const [stats, setStats] = useState(getTitleCacheStats());
  const [, setVersion] = useState(0);

  useEffect(() => {
    const handleTitleUpdate = () => {
      setStats(getTitleCacheStats());
      setVersion((v) => v + 1);
    };

    const handleModeUpdate = (e: any) => {
      if (e.detail?.mode) {
        setDisplayModeState(e.detail.mode);
      } else {
        setDisplayModeState(getStoredDisplayMode());
      }
    };

    window.addEventListener('retroasmr-titles-updated', handleTitleUpdate);
    window.addEventListener('retroasmr-display-mode-updated', handleModeUpdate);

    return () => {
      window.removeEventListener('retroasmr-titles-updated', handleTitleUpdate);
      window.removeEventListener('retroasmr-display-mode-updated', handleModeUpdate);
    };
  }, []);

  const setDisplayMode = useCallback((mode: TitleDisplayMode) => {
    setStoredDisplayMode(mode);
    setDisplayModeState(mode);
  }, []);

  /**
   * Helper that returns the translated text if display mode is 'en' or 'vi' and cached,
   * otherwise returns original text. Also provides info on whether it was translated.
   */
  const getDisplayTitle = useCallback(
    (originalText?: string): { text: string; isTranslated: boolean; lang: TitleDisplayMode } => {
      if (!originalText) return { text: '', isTranslated: false, lang: 'original' };
      if (displayMode === 'original') {
        return { text: originalText, isTranslated: false, lang: 'original' };
      }

      const cached = getCachedTitle(originalText, displayMode);
      if (cached) {
        return { text: cached, isTranslated: true, lang: displayMode };
      }

      return { text: originalText, isTranslated: false, lang: displayMode };
    },
    [displayMode]
  );

  return {
    displayMode,
    setDisplayMode,
    stats,
    getDisplayTitle,
  };
}

