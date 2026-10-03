import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  saveTranslatedWorkToFirestore,
  getTranslatedWorksFromFirestore,
  getTranslatedWorkFromFirestore,
  saveTitleTranslationsToFirestore,
  getCachedTitlesFromFirestore,
  saveScriptTranslationToFirestore,
  getCachedScriptFromFirestore,
  validateFirebaseConnection,
} from './firebase';

export interface TranslateOptions {
  targetLang: string;
  sourceLang?: string;
  mode?: 'translated' | 'bilingual' | 'annotations';
  tone?: 'asmr' | 'natural' | 'literal';
}

export interface TranslateResult {
  translatedText: string;
  targetLang: string;
  sourceLang: string;
  detectedSourceLang?: string;
  mode: 'translated' | 'bilingual' | 'annotations';
  charCount: number;
  engine: string;
}

export interface TranslatedWorkRecord {
  id: string | number;
  rjCode: string;
  originalTitle: string;
  translatedTitle: {
    en?: string;
    vi?: string;
  };
  translatedTracksCount: number;
  totalTracksCount?: number;
  translatedAt: string;
  coverUrl?: string;
  circle?: string;
  vas?: string;
  tags?: string[];
  trackTranslations?: Record<string, { en?: string; vi?: string }>;
}

// ==========================================
// SERVER-SIDE TRANSLATION CACHES & VAULT
// ==========================================

const CACHE_FILE_PATH = path.join(process.cwd(), 'title_translations_cache.json');
const WORKS_VAULT_FILE_PATH = path.join(process.cwd(), 'translated_works_vault.json');
const SCRIPT_CACHE_FILE_PATH = path.join(process.cwd(), 'script_translations_cache.json');

// In-memory server cache for title translations: sourceText -> { en?: string, vi?: string }
const titleTranslationServerCache = new Map<string, { en?: string; vi?: string }>();

// In-memory permanent vault of translated works: rjCode/id -> TranslatedWorkRecord
const translatedWorksVault = new Map<string, TranslatedWorkRecord>();

// In-memory server cache for full script and subtitle translations
const scriptTranslationServerCache = new Map<string, TranslateResult>();
const MAX_SCRIPT_CACHE_ITEMS = 5000;

// Initialize persistent script cache from disk if available
try {
  if (fs.existsSync(SCRIPT_CACHE_FILE_PATH)) {
    const raw = fs.readFileSync(SCRIPT_CACHE_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === 'object') {
          scriptTranslationServerCache.set(k, v as TranslateResult);
        }
      }
    }
  }
} catch (loadErr) {
  console.warn('Could not load persistent script translation cache from disk:', loadErr);
}

// Initialize persistent title cache from disk if available
try {
  if (fs.existsSync(CACHE_FILE_PATH)) {
    const raw = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === 'object') {
          titleTranslationServerCache.set(k, v as { en?: string; vi?: string });
        }
      }
    }
  }
} catch (loadErr) {
  console.warn('Could not load persistent title translation cache from disk:', loadErr);
}

// Initialize persistent translated works vault from disk if available
try {
  if (fs.existsSync(WORKS_VAULT_FILE_PATH)) {
    const raw = fs.readFileSync(WORKS_VAULT_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && (item.rjCode || item.id)) {
          const key = String(item.rjCode || item.id).toUpperCase();
          translatedWorksVault.set(key, item);
        }
      }
    }
  }
} catch (loadErr) {
  console.warn('Could not load persistent translated works vault from disk:', loadErr);
}

function persistTitleCacheToDisk(): void {
  try {
    const obj: Record<string, { en?: string; vi?: string }> = {};
    for (const [k, v] of titleTranslationServerCache.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to save title translation cache to disk:', err);
  }
}

function persistWorksVaultToDisk(): void {
  try {
    const list = Array.from(translatedWorksVault.values());
    fs.writeFileSync(WORKS_VAULT_FILE_PATH, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to save translated works vault to disk:', err);
  }
}

/**
 * Upload client-translated titles and track names to the server cache and permanent works vault
 */
export function uploadTitleTranslations(
  translations: Record<string, string>,
  targetLang: 'en' | 'vi',
  workInfo?: {
    id?: string | number;
    rjCode?: string;
    originalTitle?: string;
    coverUrl?: string;
    circle?: string;
    vas?: string;
    totalTracks?: number;
  }
): { count: number; totalCached: number; totalWorks: number } {
  const cleanLang = targetLang === 'vi' ? 'vi' : 'en';
  let addedCount = 0;

  for (const [orig, trans] of Object.entries(translations)) {
    const cleanOrig = (orig || '').trim();
    const cleanTrans = (trans || '').trim();
    if (!cleanOrig || !cleanTrans || cleanOrig === cleanTrans) continue;

    const existing = titleTranslationServerCache.get(cleanOrig) || {};
    existing[cleanLang] = cleanTrans;
    titleTranslationServerCache.set(cleanOrig, existing);
    addedCount++;
  }

  if (addedCount > 0) {
    persistTitleCacheToDisk();
    saveTitleTranslationsToFirestore(translations, cleanLang).catch(() => {});
  }

  // Update permanent works vault if workInfo is provided
  if (workInfo && (workInfo.rjCode || workInfo.id || workInfo.originalTitle)) {
    const rawRj = workInfo.rjCode || (workInfo.id ? `RJ${String(workInfo.id).replace(/^RJ/i, '')}` : '');
    const key = String(rawRj || workInfo.id || workInfo.originalTitle || 'WORK').toUpperCase();
    const existingWork: TranslatedWorkRecord = translatedWorksVault.get(key) || {
      id: workInfo.id || key,
      rjCode: rawRj || key,
      originalTitle: workInfo.originalTitle || '',
      translatedTitle: {},
      translatedTracksCount: 0,
      totalTracksCount: workInfo.totalTracks || 0,
      translatedAt: new Date().toISOString(),
      coverUrl: workInfo.coverUrl || '',
      circle: workInfo.circle || '',
      vas: workInfo.vas || '',
      trackTranslations: {},
    };

    if (!existingWork.trackTranslations) {
      existingWork.trackTranslations = {};
    }

    if (workInfo.originalTitle) {
      existingWork.originalTitle = workInfo.originalTitle;
      const directTrans = translations[workInfo.originalTitle];
      if (directTrans) {
        existingWork.translatedTitle[cleanLang] = directTrans;
      } else {
        const cached = titleTranslationServerCache.get(workInfo.originalTitle);
        if (cached?.[cleanLang]) {
          existingWork.translatedTitle[cleanLang] = cached[cleanLang];
        }
      }
    }

    // Record individual track translations
    for (const [orig, trans] of Object.entries(translations)) {
      if (orig === workInfo.originalTitle) continue;
      const cleanOrig = orig.trim();
      const cleanTrans = trans.trim();
      if (!cleanOrig || !cleanTrans || cleanOrig === cleanTrans) continue;

      if (!existingWork.trackTranslations[cleanOrig]) {
        existingWork.trackTranslations[cleanOrig] = {};
      }
      existingWork.trackTranslations[cleanOrig][cleanLang] = cleanTrans;
    }

    if (workInfo.coverUrl) existingWork.coverUrl = workInfo.coverUrl;
    if (workInfo.circle) existingWork.circle = workInfo.circle;
    if (workInfo.vas) existingWork.vas = workInfo.vas;
    if (workInfo.totalTracks) existingWork.totalTracksCount = workInfo.totalTracks;
    
    // Count translated tracks for this work
    const trackKeys = Object.keys(existingWork.trackTranslations);
    const validTracksCount = trackKeys.filter((k) => Boolean(existingWork.trackTranslations![k].en || existingWork.trackTranslations![k].vi)).length;
    existingWork.translatedTracksCount = Math.max(existingWork.translatedTracksCount, validTracksCount);
    existingWork.translatedAt = new Date().toISOString();

    translatedWorksVault.set(key, existingWork);
    persistWorksVaultToDisk();
    saveTranslatedWorkToFirestore(existingWork).catch(() => {});
  }

  return {
    count: addedCount,
    totalCached: titleTranslationServerCache.size,
    totalWorks: translatedWorksVault.size,
  };
}

/**
 * Retrieve all permanently translated works for the Translated Page with optional filtering
 */
export function getPermanentTranslatedWorks(
  lang: 'all' | 'en' | 'vi' = 'all',
  searchQuery: string = ''
): TranslatedWorkRecord[] {
  let records = Array.from(translatedWorksVault.values());
  records.sort((a, b) => new Date(b.translatedAt).getTime() - new Date(a.translatedAt).getTime());

  if (lang !== 'all') {
    records = records.filter((r) => Boolean(r.translatedTitle?.[lang]));
  }

  const q = searchQuery.trim().toLowerCase();
  if (q) {
    records = records.filter((r) => {
      const matchRj = String(r.rjCode || '').toLowerCase().includes(q);
      const matchOrig = String(r.originalTitle || '').toLowerCase().includes(q);
      const matchEn = String(r.translatedTitle?.en || '').toLowerCase().includes(q);
      const matchVi = String(r.translatedTitle?.vi || '').toLowerCase().includes(q);
      const matchCircle = String(r.circle || '').toLowerCase().includes(q);
      const matchVa = String(r.vas || '').toLowerCase().includes(q);
      return matchRj || matchOrig || matchEn || matchVi || matchCircle || matchVa;
    });
  }

  return records;
}

/**
 * Retrieve a single permanently translated work record by ID or RJ code
 */
export function getPermanentTranslatedWork(idOrRj: string): TranslatedWorkRecord | null {
  const clean = String(idOrRj || '').trim().toUpperCase();
  if (!clean) return null;

  // Direct lookup
  if (translatedWorksVault.has(clean)) {
    return translatedWorksVault.get(clean)!;
  }

  // RJ prefix variants
  const withoutRj = clean.replace(/^RJ/i, '');
  const withRj = `RJ${withoutRj}`;
  for (const record of translatedWorksVault.values()) {
    const recRj = String(record.rjCode || '').toUpperCase();
    const recId = String(record.id || '').toUpperCase();
    if (recRj === clean || recRj === withRj || recId === clean || recId === withoutRj) {
      return record;
    }
  }

  return null;
}

/**
 * Check if a work's title and all of its tracks are already translated in the chosen language.
 * If already translated, translation should be completely skipped.
 */
export function checkWorkTranslationStatus(
  workIdOrRj: string,
  originalTitle: string,
  trackTitles: string[],
  targetLang: 'en' | 'vi' = 'en'
): {
  isFullyTranslated: boolean;
  titleTranslated: boolean;
  translatedTitle?: string;
  totalItems: number;
  translatedCount: number;
  missingCount: number;
  missingItems: string[];
  cachedTranslations: Record<string, string>;
} {
  const cleanLang = targetLang === 'vi' ? 'vi' : 'en';
  const cachedTranslations: Record<string, string> = {};
  const missingItems: string[] = [];

  const cleanTitle = (originalTitle || '').trim();
  let titleTranslated = false;
  let translatedTitle: string | undefined;

  // 1. Check title translation
  if (cleanTitle) {
    const cached = titleTranslationServerCache.get(cleanTitle);
    if (cached && cached[cleanLang] && cached[cleanLang] !== cleanTitle) {
      titleTranslated = true;
      translatedTitle = cached[cleanLang];
      cachedTranslations[cleanTitle] = cached[cleanLang]!;
    } else {
      missingItems.push(cleanTitle);
    }
  }

  // 2. Check track titles
  for (const track of trackTitles) {
    const cleanTrack = (track || '').trim();
    if (!cleanTrack) continue;

    const cached = titleTranslationServerCache.get(cleanTrack);
    if (cached && cached[cleanLang] && cached[cleanLang] !== cleanTrack) {
      cachedTranslations[cleanTrack] = cached[cleanLang]!;
    } else {
      if (!missingItems.includes(cleanTrack)) {
        missingItems.push(cleanTrack);
      }
    }
  }

  const allItems = [cleanTitle, ...trackTitles.map((t) => (t || '').trim())].filter(Boolean);
  const uniqueItems = Array.from(new Set(allItems));
  const totalItems = uniqueItems.length;
  const translatedCount = totalItems - missingItems.length;
  const isFullyTranslated = totalItems > 0 && missingItems.length === 0;

  return {
    isFullyTranslated,
    titleTranslated,
    translatedTitle,
    totalItems,
    translatedCount,
    missingCount: missingItems.length,
    missingItems,
    cachedTranslations,
  };
}

/**
 * Get permanent translation statistics
 */
export function getPermanentTranslationStats() {
  const all = Array.from(translatedWorksVault.values());
  const enCount = all.filter((w) => Boolean(w.translatedTitle?.en)).length;
  const viCount = all.filter((w) => Boolean(w.translatedTitle?.vi)).length;
  return {
    totalWorks: all.length,
    enWorksCount: enCount,
    viWorksCount: viCount,
    totalTitlesCached: titleTranslationServerCache.size,
  };
}

/**
 * Check which titles are already cached on the server
 */
export function getCachedTitlesBatch(
  texts: string[],
  targetLang: 'en' | 'vi'
): { cached: Record<string, string>; missing: string[] } {
  const cleanLang = targetLang === 'vi' ? 'vi' : 'en';
  const cached: Record<string, string> = {};
  const missing: string[] = [];

  for (const raw of texts) {
    const trimmed = (raw || '').trim();
    if (!trimmed) continue;

    const entry = titleTranslationServerCache.get(trimmed);
    if (entry && entry[cleanLang] && entry[cleanLang] !== trimmed) {
      cached[trimmed] = entry[cleanLang]!;
    } else {
      if (!missing.includes(trimmed)) {
        missing.push(trimmed);
      }
    }
  }

  return { cached, missing };
}

function persistScriptCacheToDisk(): void {
  try {
    const obj: Record<string, TranslateResult> = {};
    for (const [k, v] of scriptTranslationServerCache.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(SCRIPT_CACHE_FILE_PATH, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to save script translation cache to disk:', err);
  }
}

export function getScriptCacheKey(
  textOrHash: string,
  options: { targetLang?: string; mode?: string; tone?: string; sourceLang?: string } = {}
): string {
  const isShortHash = textOrHash.length <= 64 && !textOrHash.includes('\n') && !textOrHash.includes(' ');
  const hash = isShortHash ? textOrHash.trim() : crypto.createHash('sha256').update(textOrHash.trim()).digest('hex');
  const target = (options.targetLang || 'en').toLowerCase().trim();
  const mode = (options.mode || 'translated').toLowerCase().trim();
  return `${hash}:${target}:${mode}`;
}

export function saveScriptToCache(cacheKey: string, result: TranslateResult) {
  if (scriptTranslationServerCache.size >= MAX_SCRIPT_CACHE_ITEMS) {
    const firstKey = scriptTranslationServerCache.keys().next().value;
    if (firstKey) scriptTranslationServerCache.delete(firstKey);
  }
  scriptTranslationServerCache.set(cacheKey, result);
  persistScriptCacheToDisk();
}

export function getCachedScriptTranslation(cacheKey: string): TranslateResult | null {
  return scriptTranslationServerCache.get(cacheKey) || null;
}

export function uploadScriptTranslation(params: {
  cacheKey?: string;
  hash?: string;
  rawText?: string;
  targetLang: string;
  mode?: string;
  translatedText: string;
  sourceLang?: string;
  workId?: string;
}): { success: boolean; totalCachedScripts: number; cacheKey: string } {
  const { targetLang, mode = 'translated', translatedText, sourceLang = 'Auto' } = params;
  const keyToUse = params.cacheKey || getScriptCacheKey(params.rawText || params.hash || 'script', { targetLang, mode });
  
  if (!translatedText || !translatedText.trim()) {
    return { success: false, totalCachedScripts: scriptTranslationServerCache.size, cacheKey: keyToUse };
  }

  const resultObj: TranslateResult = {
    translatedText: translatedText.trim(),
    targetLang,
    sourceLang,
    detectedSourceLang: sourceLang,
    mode: mode as any,
    charCount: translatedText.length,
    engine: 'client-gemini-flash-lite',
  };

  saveScriptToCache(keyToUse, resultObj);
  saveScriptTranslationToFirestore(keyToUse, resultObj).catch(() => {});

  return { success: true, totalCachedScripts: scriptTranslationServerCache.size, cacheKey: keyToUse };
}

/**
 * Sync vault and translation dictionaries from Firestore into server memory on boot
 */
export async function initFirestoreVaultSync(): Promise<void> {
  try {
    await validateFirebaseConnection();
    const fsWorks = await getTranslatedWorksFromFirestore();
    for (const work of fsWorks) {
      if (work && (work.rjCode || work.id)) {
        const key = String(work.rjCode || work.id).toUpperCase();
        translatedWorksVault.set(key, work);

        if (work.originalTitle && work.translatedTitle) {
          const existing = titleTranslationServerCache.get(work.originalTitle) || {};
          if (work.translatedTitle.en) existing.en = work.translatedTitle.en;
          if (work.translatedTitle.vi) existing.vi = work.translatedTitle.vi;
          titleTranslationServerCache.set(work.originalTitle, existing);
        }

        if (work.trackTranslations) {
          for (const [tOrig, tMap] of Object.entries(work.trackTranslations)) {
            const existing = titleTranslationServerCache.get(tOrig) || {};
            if (tMap.en) existing.en = tMap.en;
            if (tMap.vi) existing.vi = tMap.vi;
            titleTranslationServerCache.set(tOrig, existing);
          }
        }
      }
    }
    console.log(`✓ Firestore vault restored: ${translatedWorksVault.size} works, ${titleTranslationServerCache.size} titles in memory.`);
  } catch (err) {
    console.warn('Firestore vault sync warning:', err);
  }
}

// Trigger initial sync on module load
initFirestoreVaultSync().catch(() => {});

export function getServerTranslationCacheStats() {
  return {
    scriptCacheCount: scriptTranslationServerCache.size,
    titleCacheCount: titleTranslationServerCache.size,
  };
}

export function clearServerTranslationCache() {
  scriptTranslationServerCache.clear();
  titleTranslationServerCache.clear();
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) fs.unlinkSync(CACHE_FILE_PATH);
    if (fs.existsSync(SCRIPT_CACHE_FILE_PATH)) fs.unlinkSync(SCRIPT_CACHE_FILE_PATH);
  } catch {}
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  'zh-hans': 'Simplified Chinese (简体中文)',
  'zh-cn': 'Simplified Chinese (简体中文)',
  zh: 'Simplified Chinese (简体中文)',
  'zh-hant': 'Traditional Chinese (繁體中文)',
  'zh-tw': 'Traditional Chinese (繁體中文)',
  'zh-hk': 'Traditional Chinese (繁體中文)',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  vi: 'Vietnamese (Tiếng Việt)',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  ru: 'Russian (Русский)',
  id: 'Indonesian (Bahasa Indonesia)',
  th: 'Thai (ไทย)',
  pt: 'Portuguese (Português)',
  it: 'Italian (Italiano)',
};

function getLangName(code: string): string {
  const normalized = code.toLowerCase().trim();
  return LANGUAGE_NAMES[normalized] || code;
}

/**
 * High-accuracy multi-language detector for Japanese, Chinese (Simplified & Traditional),
 * Korean, Vietnamese, English, Russian, Thai, French, German, Spanish, Portuguese, Italian, Indonesian, etc.
 */
export function detectLanguage(text: string): { code: string; name: string; flag: string } {
  if (!text || !text.trim()) {
    return { code: 'auto', name: 'Auto-detected', flag: '' };
  }

  // Clean timecodes, track markers, file tags, and metadata to focus detection on spoken dialogue
  const cleanedText = text
    .replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '') // remove [00:00.00]
    .replace(/\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3}/g, '') // remove SRT timecodes
    .replace(/\[(?:SE|BGM|CV|Track|Scene|Chapter|Vol|No|Title|Artist|Album)[^\]]*\]/gi, '') // remove metadata tags
    .slice(0, 4000);

  const sample = cleanedText.trim() || text.slice(0, 3000);

  // 1. Japanese: Hiragana (\u3040-\u309F) or Katakana (\u30A0-\u30FF)
  const jpKanaMatch = sample.match(/[\u3040-\u309F\u30A0-\u30FF]/g);
  if (jpKanaMatch && jpKanaMatch.length >= 2) {
    return { code: 'ja', name: 'Japanese (日本語)', flag: 'JP' };
  }

  // 2. Korean: Hangul (\uAC00-\uD7AF, \u1100-\u11FF, \u3130-\u318F)
  const koMatch = sample.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g);
  if (koMatch && koMatch.length >= 2) {
    return { code: 'ko', name: 'Korean (한국어)', flag: 'KR' };
  }

  // 3. Chinese (Hanzi without Japanese kana)
  const hanziMatch = sample.match(/[\u4E00-\u9FFF]/g);
  if (hanziMatch && hanziMatch.length >= 3) {
    const tradMatch = sample.match(/[體點與廣國變讓發無實後關門頭現動機專樣應開義過總業題邊聽經樂場隊導話術際觀帶區裏這個麼樣臺歡]/g);
    const simpMatch = sample.match(/[体点与广国变让发无实后关门头现动机专样应开义过总业题边听经乐场队导话术际观带区里这个么样台欢]/g);
    if (tradMatch && (!simpMatch || tradMatch.length > simpMatch.length)) {
      return { code: 'zh-hant', name: 'Traditional Chinese (繁體中文)', flag: 'TW' };
    }
    return { code: 'zh-hans', name: 'Simplified Chinese (简体中文)', flag: 'CN' };
  }

  // 4. Vietnamese: Latin with specific Vietnamese vowel accents & tonal marks
  const viMatch = sample.match(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/gi);
  if (viMatch && viMatch.length >= 2) {
    return { code: 'vi', name: 'Vietnamese (Tiếng Việt)', flag: 'VI' };
  }

  // 5. Russian / Cyrillic
  const cyrMatch = sample.match(/[\u0400-\u04FF]/g);
  if (cyrMatch && cyrMatch.length >= 3) {
    return { code: 'ru', name: 'Russian (Русский)', flag: 'RU' };
  }

  // 6. Thai
  const thaiMatch = sample.match(/[\u0E00-\u0E7F]/g);
  if (thaiMatch && thaiMatch.length >= 3) {
    return { code: 'th', name: 'Thai (ไทย)', flag: 'TH' };
  }

  // 7. European languages
  if (sample.match(/[äöüßÄÖÜ]/g)) {
    return { code: 'de', name: 'German (Deutsch)', flag: 'DE' };
  }
  if (sample.match(/[éèêëçœÉÈÊËÇ]/g)) {
    return { code: 'fr', name: 'French (Français)', flag: 'FR' };
  }
  if (sample.match(/[ñÑ¿¡áíóúÁÍÓÚ]/g)) {
    return { code: 'es', name: 'Spanish (Español)', flag: 'ES' };
  }
  if (sample.match(/[ãõâêôáéíóúçÃÕÂÊÔÁÉÍÓÚÇ]/g)) {
    return { code: 'pt', name: 'Portuguese (Português)', flag: 'PT' };
  }
  if (sample.match(/[àèéìòùÀÈÉÌÒÙ]/g)) {
    return { code: 'it', name: 'Italian (Italiano)', flag: 'IT' };
  }

  // 8. Indonesian / Malay
  if (/\b(?:yang|dan|di|ini|itu|untuk|dengan|kamu|aku|tidak|adalah|bisa|saya)\b/i.test(sample)) {
    return { code: 'id', name: 'Indonesian (Bahasa Indonesia)', flag: 'ID' };
  }

  // 9. English / Generic Latin
  const englishMatch = sample.match(/[a-zA-Z]/g);
  if (englishMatch && englishMatch.length > 10) {
    return { code: 'en', name: 'English', flag: 'EN' };
  }

  return { code: 'auto', name: 'Auto-detected', flag: '' };
}

export interface TranslateTitleResult {
  translations: Record<string, string>;
  targetLang: string;
  engine: string;
  fromCacheCount: number;
  newTranslatedCount: number;
}

// In-memory server cache for title translations: sourceText -> { en?: string, vi?: string }
// (Declared above with scriptTranslationServerCache)

// Helper: Strip markdown fences from JSON response
function cleanJsonText(raw: string): string {
  let s = (raw || '').trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return s.trim();
}

// Built-in glossary dictionary for ASMR and voice drama terminology
const ASMR_GLOSSARY_EN: Record<string, string> = {
  '耳かき': 'Ear Cleaning',
  '耳掃除': 'Ear Cleaning',
  '囁き': 'Whispering',
  'ささやき': 'Whispering',
  '吐息': 'Breathing Sounds',
  '添い寝': 'Co-Sleeping',
  '膝枕': 'Lap Pillow',
  '甘々': 'Sweet Pampering',
  '耳舐め': 'Ear Licking',
  '耳なめ': 'Ear Licking',
  'オナサポ': 'Masturbation Guidance',
  '安眠': 'Sleep Aid',
  '洗髪': 'Hair Washing',
  'シャンプー': 'Shampoo',
  'マッサージ': 'Massage',
  'バイノーラル': 'Binaural',
  '立体音響': 'Binaural 3D Audio',
  '純愛': 'Pure Love',
  'ツンデレ': 'Tsundere',
  'クーデレ': 'Kuudere',
  'ヤンデレ': 'Yandere',
  'メスガキ': 'Bratty Girl',
  'お姉ちゃん': 'Older Sister',
  '妹': 'Little Sister',
  '幼馴染': 'Childhood Friend',
  '後輩': 'Junior',
  '先輩': 'Senior',
  '同級生': 'Classmate',
  '本編': 'Main Story',
  'トラック': 'Track',
  'おまけ': 'Bonus',
  '特典': 'Special Bonus',
  '後日談': 'After Story',
  'フリートーク': 'Free Talk',
  '全編': 'Full Edition',
  '導入': 'Intro',
  'プロローグ': 'Prologue',
  'エピローグ': 'Epilogue',
};

const ASMR_GLOSSARY_VI: Record<string, string> = {
  '耳かき': 'Ráy tai / Cạo tai',
  '耳掃除': 'Vệ sinh tai',
  '囁き': 'Thì thầm',
  'ささやき': 'Thì thầm',
  '吐息': 'Hơi thở',
  '添い寝': 'Ngủ cùng / Ôm ngủ',
  '膝枕': 'Gối đầu lên đùi',
  '甘々': 'Nuông chiều ngọt ngào',
  '耳舐め': 'Liếm tai',
  '耳なめ': 'Liếm tai',
  'オナサポ': 'Hướng dẫn tự sướng',
  '安眠': 'Ngủ ngon',
  '洗髪': 'Gội đầu',
  'シャンプー': 'Dầu gội',
  'マッサージ': 'Mát-xa',
  'バイノーラル': 'Binaural âm thanh vòm 3D',
  '立体音響': 'Âm thanh 3D',
  '純愛': 'Tình yêu thuần khiết',
  'メスガキ': 'Bé gái kiêu ngạo / Mesugaki',
  '本編': 'Phần chính',
  'トラック': 'Track',
  'おまけ': 'Phần tặng kèm',
  '特典': 'Phần thưởng',
  '後日談': 'Ngoại truyện sau này',
  'フリートーク': 'Trò chuyện tự do',
  '全編': 'Toàn tập',
};

/**
 * Single/Batch Google Translate GTX fallback
 */
async function callGoogleTranslateGTX(query: string, targetLang: string): Promise<string> {
  const cleanTarget = targetLang.split('-')[0] || 'en';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
    cleanTarget
  )}&dt=t&q=${encodeURIComponent(query)}`;
  
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: '*/*',
    },
  });

  if (!res.ok) {
    throw new Error(`Google Translate HTTP ${res.status}`);
  }

  const data: any = await res.json();
  if (Array.isArray(data) && Array.isArray(data[0])) {
    const parts = data[0].map((item: any) => (Array.isArray(item) ? item[0] : '')).filter(Boolean);
    return parts.join('');
  }
  return '';
}

/**
 * Fallback translation using MyMemory API
 */
async function callMyMemoryTranslate(text: string, targetLang: string): Promise<string> {
  const cleanTarget = targetLang.split('-')[0] || 'en';
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
    text
  )}&langpair=ja|${encodeURIComponent(cleanTarget)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RetroASMR/1.0',
      Accept: 'application/json',
    },
  });
  if (res.ok) {
    const data: any = await res.json();
    if (data?.responseData?.translatedText) {
      return data.responseData.translatedText;
    }
  }
  return '';
}

/**
 * Free Google Translate fallback for offline / keyless environments with auto language detection & batching
 */
async function fallbackGoogleTranslate(text: string, targetLang: string): Promise<string> {
  if (!text || !text.trim()) return '';
  const cleanTarget = targetLang.split('-')[0] || 'en';

  try {
    const gtxResult = await callGoogleTranslateGTX(text, cleanTarget);
    if (gtxResult && gtxResult.trim()) {
      return gtxResult.trim();
    }
  } catch {}

  try {
    const mmResult = await callMyMemoryTranslate(text, cleanTarget);
    if (mmResult && mmResult.trim() && !mmResult.includes('MYMEMORY WARNING')) {
      return mmResult.trim();
    }
  } catch {}

  // Glossary replacement fallback
  let glossaryResult = text;
  const glossary = cleanTarget === 'vi' ? ASMR_GLOSSARY_VI : ASMR_GLOSSARY_EN;
  for (const [jp, trans] of Object.entries(glossary)) {
    if (glossaryResult.includes(jp)) {
      glossaryResult = glossaryResult.replaceAll(jp, ` ${trans} `);
    }
  }
  return glossaryResult.replace(/\s+/g, ' ').trim();
}

/**
 * Batch retrieves work titles and track names from server cache (translated client-side via user's Gemini key)
 */
export async function translateTitles(
  texts: string[],
  targetLang: 'en' | 'vi' = 'en'
): Promise<TranslateTitleResult> {
  const cleanLang = targetLang === 'vi' ? 'vi' : 'en';
  const result: Record<string, string> = {};
  const missingTexts: string[] = [];
  let fromCacheCount = 0;

  // Check in-memory server cache
  for (const raw of texts) {
    const trimmed = (raw || '').trim();
    if (!trimmed) continue;
    const cachedEntry = titleTranslationServerCache.get(trimmed);
    if (cachedEntry && cachedEntry[cleanLang] && cachedEntry[cleanLang] !== trimmed) {
      result[trimmed] = cachedEntry[cleanLang]!;
      fromCacheCount++;
    } else if (!missingTexts.includes(trimmed)) {
      missingTexts.push(trimmed);
    }
  }

  // Any remaining uncached titles are preserved as original until translated client-side
  for (const text of missingTexts) {
    result[text] = text;
  }

  return {
    translations: result,
    targetLang: cleanLang,
    engine: fromCacheCount > 0 ? 'server-cache' : 'untranslated',
    fromCacheCount,
    newTranslatedCount: 0,
  };
}

/**
 * Script translation utilizing Google fallback with auto language detection & server caching
 * (Uses Google fallback for script translation as requested)
 */
export async function translateScript(
  text: string,
  options: TranslateOptions
): Promise<TranslateResult> {
  const targetLang = options.targetLang || 'en';
  const mode = options.mode || 'translated';
  
  // Auto-detect the source language from text content
  const detected = detectLanguage(text);
  const isExplicitSource =
    options.sourceLang &&
    options.sourceLang !== 'auto' &&
    options.sourceLang !== 'Auto-detected' &&
    options.sourceLang.toLowerCase() !== 'auto';
  const sourceLang = isExplicitSource ? options.sourceLang! : detected.name;

  if (!text || text.trim().length === 0) {
    return {
      translatedText: '',
      targetLang,
      sourceLang,
      detectedSourceLang: detected.name,
      mode,
      charCount: 0,
      engine: 'none',
    };
  }

  // 1. Check Server-Side Script Translation Cache
  const cacheKey = getScriptCacheKey(text, options);
  const cached = scriptTranslationServerCache.get(cacheKey);
  if (cached) {
    return {
      ...cached,
      engine: 'server-cache',
    };
  }

  // 2. High-speed Google fallback translator with auto-detection
  const fallbackTranslated = await fallbackGoogleTranslate(text, targetLang);
  let finalResult = fallbackTranslated;

  if (mode === 'bilingual') {
    const origLines = text.split('\n');
    const transLines = fallbackTranslated.split('\n');
    const combined: string[] = [];
    for (let i = 0; i < Math.max(origLines.length, transLines.length); i++) {
      const o = origLines[i] || '';
      const t = transLines[i] || '';
      if (o.trim()) combined.push(o);
      if (t.trim() && t.trim() !== o.trim()) combined.push(`  → ${t}`);
      if (!o.trim() && !t.trim()) combined.push('');
    }
    finalResult = combined.join('\n');
  }

  const resultObj: TranslateResult = {
    translatedText: finalResult,
    targetLang,
    sourceLang,
    detectedSourceLang: detected.name,
    mode,
    charCount: finalResult.length,
    engine: 'google-translate-fallback',
  };

  saveScriptToCache(cacheKey, resultObj);
  return resultObj;
}

