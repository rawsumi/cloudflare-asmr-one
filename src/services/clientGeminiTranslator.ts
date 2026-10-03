/**
 * Client-Side Gemini Title & Track Translation Service
 * 
 * Executes title and track translations directly in the user's browser using their
 * own Google Gemini API key, and uploads results to the server cache.
 */

export const GEMINI_API_KEY_STORAGE = 'retroasmr_gemini_api_key';

export const LANGUAGE_NAME_MAP: Record<string, string> = {
  en: 'English',
  vi: 'Vietnamese (Tiếng Việt)',
  'zh-hans': 'Simplified Chinese (简体中文)',
  'zh-hant': 'Traditional Chinese (繁體中文)',
  ko: 'Korean (한국어)',
  ja: 'Japanese (日本語)',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  ru: 'Russian (Русский)',
  id: 'Indonesian (Bahasa Indonesia)',
  th: 'Thai (ไทย)',
  pt: 'Portuguese (Português)',
  it: 'Italian (Italiano)',
};

export function getStoredGeminiApiKey(): string {
  try {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(GEMINI_API_KEY_STORAGE) || '').trim();
    }
  } catch {}
  return '';
}

export function setStoredGeminiApiKey(key: string): void {
  try {
    if (typeof window !== 'undefined') {
      const cleanKey = (key || '').trim();
      if (cleanKey) {
        localStorage.setItem(GEMINI_API_KEY_STORAGE, cleanKey);
      } else {
        localStorage.removeItem(GEMINI_API_KEY_STORAGE);
      }
      window.dispatchEvent(new CustomEvent('retroasmr-gemini-key-updated', { detail: { hasKey: Boolean(cleanKey) } }));
    }
  } catch {}
}

export function hasStoredGeminiApiKey(): boolean {
  return Boolean(getStoredGeminiApiKey());
}

export function clearStoredGeminiApiKey(): void {
  setStoredGeminiApiKey('');
}

/**
 * Sanitize error messages to guarantee no API key is ever leaked in logs, UI, or traces
 */
export function sanitizeErrorMessage(raw: any): string {
  const msg = String(raw?.message || raw || 'Error');
  return msg
    .replace(/key=[a-zA-Z0-9_\-]+/gi, 'key=[REDACTED]')
    .replace(/AIza[a-zA-Z0-9_\-]{30,}/g, '[REDACTED_API_KEY]');
}

// Strip markdown formatting if Gemini returns ```json ... ```
function cleanJsonText(raw: string): string {
  let s = (raw || '').trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return s.trim();
}

/**
 * Check which titles are already cached on the server
 */
export async function checkServerCachedTitles(
  texts: string[],
  targetLang: 'en' | 'vi'
): Promise<{ cached: Record<string, string>; missing: string[] }> {
  try {
    const res = await fetch('/api/translate/cached-titles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, targetLang }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Failed to query server translation cache:', err);
  }

  return { cached: {}, missing: texts };
}

/**
 * Upload client-translated titles and tracks to the server cache and permanent works vault
 */
export async function uploadTranslationsToServer(
  targetLang: 'en' | 'vi',
  translations: Record<string, string>,
  workInfo?: {
    id?: string | number;
    rjCode?: string;
    originalTitle?: string;
    coverUrl?: string;
    circle?: string;
    vas?: string;
    totalTracks?: number;
  }
): Promise<boolean> {
  const keys = Object.keys(translations);
  if (keys.length === 0) return true;

  try {
    const res = await fetch('/api/translate/cache-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLang, translations, workInfo }),
    });
    return res.ok;
  } catch (err) {
    console.warn('Failed to upload translations to server cache:', err);
    return false;
  }
}

/**
 * Fetch list of permanently translated works from the server vault for the Translated Page
 */
export async function fetchPermanentTranslatedWorks(
  lang: 'all' | 'en' | 'vi' = 'all',
  searchQuery: string = ''
): Promise<{ works: any[]; total: number; stats?: any }> {
  try {
    const params = new URLSearchParams();
    if (lang && lang !== 'all') params.set('lang', lang);
    if (searchQuery) params.set('q', searchQuery);
    const res = await fetch(`/api/translate/works?${params.toString()}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Failed to fetch permanent translated works from server:', err);
  }
  return { works: [], total: 0 };
}

/**
 * Check if a work's title and all of its tracks are already translated in the chosen language.
 * If already translated, translation should be completely skipped.
 */
export async function checkIfWorkIsTranslated(
  workIdOrRj: string,
  originalTitle: string,
  trackTitles: string[],
  targetLang: 'en' | 'vi'
): Promise<{
  isFullyTranslated: boolean;
  titleTranslated: boolean;
  translatedTitle?: string;
  totalItems: number;
  translatedCount: number;
  missingCount: number;
  missingItems: string[];
  cachedTranslations: Record<string, string>;
}> {
  try {
    const res = await fetch('/api/translate/check-work', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workIdOrRj,
        originalTitle,
        trackTitles,
        targetLang,
      }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Failed to check work translation status via API:', err);
  }

  // Local fallback check
  const allTexts = [originalTitle, ...trackTitles].map((t) => (t || '').trim()).filter(Boolean);
  const cacheRes = await checkServerCachedTitles(allTexts, targetLang);
  const isFullyTranslated = allTexts.length > 0 && cacheRes.missing.length === 0;

  return {
    isFullyTranslated,
    titleTranslated: Boolean(cacheRes.cached[originalTitle]),
    translatedTitle: cacheRes.cached[originalTitle],
    totalItems: allTexts.length,
    translatedCount: Object.keys(cacheRes.cached).length,
    missingCount: cacheRes.missing.length,
    missingItems: cacheRes.missing,
    cachedTranslations: cacheRes.cached,
  };
}

/**
 * Extract core title by detecting and removing repetitive track index prefixes
 * (e.g. "01 - 耳かき" -> prefix: "01 - ", core: "耳かき").
 */
export function extractCoreTitle(text: string): { prefix: string; core: string } {
  const clean = (text || '').trim();
  if (!clean) return { prefix: '', core: '' };

  const match = clean.match(/^((?:Track\s*\d+[\s\-_:\.]*|\d+[\s\-_:\.]{1,3}|\[\d+\]|\(\d+\))\s*)/i);
  if (match && match[1] && match[1].length < clean.length) {
    const prefix = match[1];
    const core = clean.slice(prefix.length).trim();
    if (core) {
      return { prefix, core };
    }
  }

  return { prefix: '', core: clean };
}

/**
 * Client-side Gemini title and track batch translation with repetitive title deduplication
 */
export async function translateTitlesWithGeminiClient(
  texts: string[],
  targetLang: 'en' | 'vi',
  apiKey: string
): Promise<Record<string, string>> {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    throw new Error('Google Gemini API Key is required. Please provide your API key.');
  }

  const cleanLang = targetLang === 'vi' ? 'vi' : 'en';
  const targetLangName = cleanLang === 'vi' ? 'Vietnamese (Tiếng Việt)' : 'English';
  const finalResult: Record<string, string> = {};

  const cleanTexts = texts.map((t) => (t || '').trim()).filter(Boolean);
  if (cleanTexts.length === 0) return finalResult;

  // 1. Extract prefix and core titles for all input texts
  const itemsMeta = cleanTexts.map((text) => {
    const { prefix, core } = extractCoreTitle(text);
    return { full: text, prefix, core };
  });

  // 2. Deduplicate core titles so repetitive track names are sent ONLY ONCE to Gemini!
  const uniqueCoreTitles = Array.from(new Set(itemsMeta.map((m) => m.core))).filter(Boolean);
  if (uniqueCoreTitles.length === 0) return finalResult;

  const translatedCores: Record<string, string> = {};

  // 3. Batch translate ONLY the unique core titles
  const batchSize = 25;
  for (let i = 0; i < uniqueCoreTitles.length; i += batchSize) {
    const batch = uniqueCoreTitles.slice(i, i + batchSize);
    const batchObjects = batch.map((text, idx) => ({ id: idx, original: text }));

    const prompt = `You are an expert multilingual audio drama, ASMR, and voice work title translator.
Task: Translate each voice work title, track name, and chapter name into ${targetLangName}.
Translate voice drama / ASMR terms accurately and naturally:
- Ear cleaning -> ${cleanLang === 'vi' ? 'Ráy tai' : 'Ear Cleaning'}
- Whispering -> ${cleanLang === 'vi' ? 'Thì thầm' : 'Whispering'}
- Breathing -> ${cleanLang === 'vi' ? 'Hơi thở' : 'Breathing Sounds'}
- Co-sleeping -> ${cleanLang === 'vi' ? 'Ngủ cùng / Ôm ngủ' : 'Co-Sleeping'}
- Lap pillow -> ${cleanLang === 'vi' ? 'Gối đùi' : 'Lap Pillow'}
- Sweet pampering -> ${cleanLang === 'vi' ? 'Nuông chiều ngọt ngào' : 'Sweet Pampering'}
- Ear licking -> ${cleanLang === 'vi' ? 'Liếm tai' : 'Ear Licking'}
- Masturbation guidance -> ${cleanLang === 'vi' ? 'Hướng dẫn tự sướng' : 'Masturbation Guidance'}
- Sleep aid -> ${cleanLang === 'vi' ? 'Ngủ ngon' : 'Sleep Aid'}
- Bratty girl / Mesugaki -> ${cleanLang === 'vi' ? 'Bé gái kiêu ngạo' : 'Bratty Girl'}

Return a JSON array where each object has:
- "id": integer index matching the input items
- "original": the exact original title
- "translated": the translated title in ${targetLangName}`;

    // Try models supported on Gemini API (gemini-3.1-flash-lite is the primary model)
    const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-flash-lite-latest'];
    let parsed: any = null;
    let lastError: any = null;

    for (const model of modelsToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          cleanKey
        )}`;

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `${prompt}\n\nITEMS TO TRANSLATE:\n${JSON.stringify(batchObjects, null, 2)}` }],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
            },
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const rawMsg = errData.error?.message || `HTTP ${res.status}`;
          const cleanMsg = sanitizeErrorMessage(rawMsg);
          lastError = new Error(cleanMsg);
          // If model not found (404), try next model candidate
          if (res.status === 404) continue;
          throw lastError;
        }

        const data: any = await res.json();
        const textContent =
          data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (textContent) {
          const cleaned = cleanJsonText(textContent);
          parsed = JSON.parse(cleaned);
          break; // successfully generated and parsed
        }
      } catch (callErr: any) {
        lastError = new Error(sanitizeErrorMessage(callErr.message));
        if (
          callErr.message?.includes('API_KEY_INVALID') ||
          callErr.message?.includes('API key not valid') ||
          callErr.message?.includes('RESOURCE_EXHAUSTED') ||
          callErr.message?.includes('quota')
        ) {
          throw lastError;
        }
      }
    }

    if (!parsed) {
      throw lastError || new Error('Failed to generate translation from Gemini API');
    }

    const list = Array.isArray(parsed) ? parsed : parsed.items || parsed.translations || [];
    for (let idx = 0; idx < list.length; idx++) {
      const item = list[idx];
      if (!item) continue;
      const trans = String(typeof item === 'string' ? item : item.translated || item.text || '').trim();
      if (!trans) continue;

      let matchedOrig = '';
      const idNum = typeof item.id === 'number' ? item.id : parseInt(String(item.id), 10);
      if (!isNaN(idNum) && batch[idNum]) {
        matchedOrig = batch[idNum];
      } else if (item.original) {
        const itemOrig = String(item.original).trim();
        matchedOrig = batch.find((b) => b === itemOrig || b.toLowerCase() === itemOrig.toLowerCase()) || '';
      }
      if (!matchedOrig && batch[idx]) {
        matchedOrig = batch[idx];
      }

      if (matchedOrig && trans) {
        translatedCores[matchedOrig] = trans;
      }
    }
  }

  // 4. Re-map translated core titles back to ALL repetitive track title entries
  for (const item of itemsMeta) {
    const translatedCore = translatedCores[item.core] || item.core;
    const fullTranslation = item.prefix ? `${item.prefix}${translatedCore}` : translatedCore;
    finalResult[item.full] = fullTranslation;
    if (item.core) {
      finalResult[item.core] = translatedCore;
    }
  }

  return finalResult;
}

/**
 * End-to-end client translation workflow:
 * 1. Checks server cache
 * 2. If all items already translated, skips translation immediately (no API calls or key needed)
 * 3. If missing items exist, requires user Gemini API key
 * 4. Translates ONLY the missing items client-side
 * 5. Uploads newly translated items and work info to server cache & permanent vault
 * 6. Returns combined translation map
 */
export async function executeTitleTranslationWorkflow(
  texts: string[],
  targetLang: 'en' | 'vi',
  providedApiKey?: string,
  workInfo?: {
    id?: string | number;
    rjCode?: string;
    originalTitle?: string;
    coverUrl?: string;
    circle?: string;
    vas?: string;
    totalTracks?: number;
  }
): Promise<{
  translations: Record<string, string>;
  fromServerCacheCount: number;
  newTranslatedCount: number;
  engine: string;
  skipped: boolean;
  skipReason?: string;
}> {
  const cleanTexts = texts.map((t) => (t || '').trim()).filter(Boolean);
  if (cleanTexts.length === 0) {
    return {
      translations: {},
      fromServerCacheCount: 0,
      newTranslatedCount: 0,
      engine: 'none',
      skipped: true,
      skipReason: 'No texts provided',
    };
  }

  // 1. Check server cache first
  const { cached, missing } = await checkServerCachedTitles(cleanTexts, targetLang);
  const finalTranslations: Record<string, string> = { ...cached };

  // CHECK: If all items are already translated, SKIP translating immediately!
  if (missing.length === 0) {
    if (workInfo) {
      uploadTranslationsToServer(targetLang, cached, workInfo).catch(() => {});
    }
    return {
      translations: finalTranslations,
      fromServerCacheCount: Object.keys(cached).length,
      newTranslatedCount: 0,
      engine: 'server-cache',
      skipped: true,
      skipReason: 'All items already translated in cache',
    };
  }

  // 2. We need to translate only missing items using client Gemini key
  const apiKey = (providedApiKey || getStoredGeminiApiKey()).trim();
  if (!apiKey) {
    throw new Error('GEMINI_KEY_REQUIRED');
  }

  // 3. Translate ONLY missing items client-side using user's Gemini key
  const newTranslations = await translateTitlesWithGeminiClient(missing, targetLang, apiKey);

  // 4. Upload to server cache & permanent works vault for all future requests
  if (Object.keys(newTranslations).length > 0) {
    await uploadTranslationsToServer(targetLang, newTranslations, workInfo);
  }

  // Combine results
  for (const [k, v] of Object.entries(newTranslations)) {
    finalTranslations[k] = v;
  }

  return {
    translations: finalTranslations,
    fromServerCacheCount: Object.keys(cached).length,
    newTranslatedCount: Object.keys(newTranslations).length,
    engine: 'client-gemini',
    skipped: false,
  };
}

/**
 * Intelligent line-boundary chunker for large voice drama and ASMR scripts
 */
export function splitScriptIntoChunks(text: string, maxChunkLength: number = 2500): string[] {
  if (!text || text.length <= maxChunkLength) return [text || ''];
  const lines = text.split('\n');
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLen = 0;

  for (const line of lines) {
    if (currentLen + line.length + 1 > maxChunkLength && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
      currentChunk = [line];
      currentLen = line.length + 1;
    } else {
      currentChunk.push(line);
      currentLen += line.length + 1;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n'));
  }

  return chunks;
}

/**
 * Check if a script is already translated in server cache
 */
export async function checkServerCachedScript(
  textOrHash: string,
  targetLang: string,
  mode: string = 'translated'
): Promise<{ cached: boolean; translatedText?: string; sourceLang?: string }> {
  try {
    const res = await fetch('/api/translate/script-cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash: textOrHash.length <= 64 ? textOrHash : '', text: textOrHash, targetLang, mode }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Script cache check failed:', err);
  }
  return { cached: false };
}

/**
 * Upload client-translated script to server cache (strictly NO API key sent)
 */
export async function uploadScriptTranslationToServer(params: {
  hash?: string;
  text?: string;
  targetLang: string;
  mode?: string;
  translatedText: string;
  sourceLang?: string;
  workId?: string;
}): Promise<boolean> {
  try {
    const res = await fetch('/api/translate/script-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return res.ok;
  } catch (err) {
    console.warn('Failed to upload script translation to server:', err);
    return false;
  }
}

/**
 * Client-Side Gemini Flash Lite Script Translation Workflow
 * 1. Checks server cache (skips if already translated)
 * 2. Translates client-side via Gemini Flash Lite using user's stored key
 * 3. Uploads to server cache so future views load with 0 API calls
 */
export async function translateScriptWithGeminiClient(params: {
  rawText: string;
  targetLang: string;
  mode?: 'translated' | 'bilingual';
  apiKey?: string;
  workId?: string;
  hash?: string;
  onProgress?: (current: number, total: number) => void;
}): Promise<{
  translatedText: string;
  targetLang: string;
  mode: string;
  fromCache: boolean;
  engine: string;
  skipped: boolean;
}> {
  const { rawText, targetLang, mode = 'translated', workId, hash, onProgress } = params;
  const cleanLang = targetLang.toLowerCase();

  // 1. Check if already translated in server cache (Smart Skip)
  const cacheCheck = await checkServerCachedScript(hash || rawText, cleanLang, mode);
  if (cacheCheck.cached && cacheCheck.translatedText) {
    return {
      translatedText: cacheCheck.translatedText,
      targetLang: cleanLang,
      mode,
      fromCache: true,
      engine: 'server-cache',
      skipped: true,
    };
  }

  // 2. Validate API key
  const cleanKey = (params.apiKey || getStoredGeminiApiKey()).trim();
  if (!cleanKey) {
    throw new Error('GEMINI_KEY_REQUIRED');
  }

  const targetLangName = LANGUAGE_NAME_MAP[cleanLang] || cleanLang.toUpperCase();
  const chunks = splitScriptIntoChunks(rawText, 2500);
  const translatedChunks: string[] = [];

  const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-flash-lite-latest'];

  for (let i = 0; i < chunks.length; i++) {
    if (onProgress) onProgress(i + 1, chunks.length);
    const chunk = chunks[i];

    const promptText = `You are an expert audio drama, ASMR, and voice work script translator.
Translate the following script dialogue and stage directions into ${targetLangName}.
Preserve voice acting formatting, character names, brackets (like 【...】, （...）), breathing tags, and whispering nuances.
${mode === 'bilingual' ? 'For each dialogue line or paragraph, output the original line followed by its translation.' : 'Output only the translated script lines.'}
Do not add any conversational remarks, introduction, or conclusion.

Script chunk to translate:
${chunk}`;

    let chunkResult: string | null = null;
    let lastError: any = null;

    for (const model of modelsToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cleanKey)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
              temperature: 0.3,
            },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText && candidateText.trim()) {
            chunkResult = candidateText.trim();
            break;
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          lastError = errData?.error?.message || `HTTP ${res.status}`;
        }
      } catch (err: any) {
        lastError = err.message || 'Network error';
      }
    }

    if (!chunkResult) {
      throw new Error(`Failed to translate script chunk ${i + 1}/${chunks.length}: ${sanitizeErrorMessage(lastError || 'Gemini error')}`);
    }

    translatedChunks.push(chunkResult);
  }

  const combined = translatedChunks.join('\n\n');

  // 3. Upload to server cache for permanent persistence (strictly NO API key sent)
  await uploadScriptTranslationToServer({
    hash,
    text: rawText,
    targetLang: cleanLang,
    mode,
    translatedText: combined,
    workId,
  });

  return {
    translatedText: combined,
    targetLang: cleanLang,
    mode,
    fromCache: false,
    engine: 'client-gemini-flash-lite',
    skipped: false,
  };
}
