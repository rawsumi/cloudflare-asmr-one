import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import {
  translateScript,
  translateTitles,
  getServerTranslationCacheStats,
  uploadTitleTranslations,
  getCachedTitlesBatch,
  getPermanentTranslatedWorks,
  getPermanentTranslatedWork,
  getPermanentTranslationStats,
  checkWorkTranslationStatus,
  getScriptCacheKey,
  getCachedScriptTranslation,
  uploadScriptTranslation,
  initFirestoreVaultSync,
} from './src/services/translator';

const require = createRequire(import.meta.url);
const archiver = require('archiver');

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Common headers for fetching upstream ASMR.one API
const ASMR_API_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://www.asmr.one/',
};

// Helper: Format bytes to human readable string (KB, MB)
function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// Helper: Format seconds to MM:SS
function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// Helper: Recursively flatten tracks tree into a list of items with path
interface FlattenedTrack {
  hash?: string;
  title: string;
  type: string;
  size?: number;
  duration?: number;
  mediaStreamUrl?: string;
  mediaDownloadUrl?: string;
  path: string;
}

function flattenTracks(items: any[], currentPath: string = ''): FlattenedTrack[] {
  let result: FlattenedTrack[] = [];
  for (const item of items) {
    const fullPath = currentPath ? `${currentPath}/${item.title}` : item.title;
    if (item.type === 'folder' && item.children) {
      result = result.concat(flattenTracks(item.children, fullPath));
    } else {
      result.push({
        hash: item.hash,
        title: item.title,
        type: item.type,
        size: item.size,
        duration: item.duration,
        mediaStreamUrl: item.mediaStreamUrl,
        mediaDownloadUrl: item.mediaDownloadUrl || item.mediaStreamUrl,
        path: fullPath,
      });
    }
  }
  return result;
}

// Helper: Resolve work ID from query, RJ code, or language edition (e.g. RJ01616686 -> database work ID)
async function resolveNumericWorkId(input: string): Promise<{ numericId: string; workMeta?: any } | null> {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;

  // 1. Search upstream API with the exact code/input first to get the genuine database ID & metadata
  try {
    const searchUrl = `https://api.asmr.one/api/search/${encodeURIComponent(trimmed)}?page=1`;
    const res = await fetch(searchUrl, { headers: ASMR_API_HEADERS });
    if (res.ok) {
      const data = await res.json();
      if (data.works && data.works.length > 0) {
        // Find exact source_id match if possible
        const cleanInput = trimmed.toUpperCase().replace(/^0+/, '');
        const exact = data.works.find((w: any) => {
          const sid = String(w.source_id || '').toUpperCase().replace(/^0+/, '');
          const wid = String(w.id || '').toUpperCase();
          return sid === cleanInput || sid === 'RJ' + cleanInput || wid === cleanInput;
        });
        const matched = exact || data.works[0];
        return {
          numericId: String(matched.id),
          workMeta: matched,
        };
      }
    }
  } catch (err) {
    console.error('Error resolving work ID via search:', err);
  }

  // 2. Fallback to extracting digits if search did not return results
  const match = trimmed.match(/^(?:RJ|VJ|BJ)?0*(\d+)$/i);
  if (match && match[1]) {
    return { numericId: match[1] };
  }

  if (/^\d+$/.test(trimmed)) {
    return { numericId: trimmed };
  }

  return { numericId: trimmed };
}

// Helper: Safely retrieve language editions array
function getLanguageEditions(w: any): any[] {
  if (!w || !w.language_editions) return [];
  if (Array.isArray(w.language_editions)) return w.language_editions;
  if (typeof w.language_editions === 'object') return Object.values(w.language_editions);
  return [];
}

// Helper: Check if work matches tag filter
function matchesTag(w: any, tag: string): boolean {
  if (!tag) return true;
  const tagLower = tag.toLowerCase().trim();
  if (!tagLower) return true;

  if (Array.isArray(w.tags)) {
    const hasTag = w.tags.some((t: any) => {
      if (!t) return false;
      if (t.name && String(t.name).toLowerCase().includes(tagLower)) return true;
      if (t.id && String(t.id) === tagLower) return true;
      if (t.i18n && typeof t.i18n === 'object') {
        return Object.values(t.i18n).some((val: any) => val?.name && String(val.name).toLowerCase().includes(tagLower));
      }
      return false;
    });
    if (hasTag) return true;
  }

  if (w.title && String(w.title).toLowerCase().includes(tagLower)) return true;
  return false;
}

// Helper: Determine accurate actual language of a specific work item
function getWorkLanguageLabel(w: any): { code: string; label: string; flag: string } {
  if (!w) return { code: 'ja', label: 'JPN', flag: '' };
  const attrs = String(w.work_attributes || '').toUpperCase();
  const transLang = String(w.translation_info?.lang || w.language || w.lang || '').toUpperCase();
  const title = String(w.title || '');
  const tagsList = Array.isArray(w.tags)
    ? w.tags.map((t: any) => String(t.name || t.id || '')).join(' ')
    : '';

  // 1. English
  if (
    attrs.includes('ENG') ||
    attrs.includes('ENGLISH') ||
    transLang.includes('ENG') ||
    transLang === 'EN' ||
    transLang === 'ENGLISH' ||
    /【(?:English|ENG|英語|En-US)】|\[(?:English|ENG|En-US)\]|\((?:English|ENG|En-US)\)|\b(?:English|ENG|En-US|EngSub|EngDub)\b|英語音声|英語字幕|英語翻訳|English\s*Ver/i.test(title) ||
    /English|英語|英語音声|英語字幕/i.test(tagsList)
  ) {
    return { code: 'en', label: 'ENG', flag: '' };
  }

  // 2. Chinese Simplified
  if (
    attrs.includes('CHI_HANS') ||
    transLang.includes('CHI_HANS') ||
    transLang.includes('ZH_CN') ||
    transLang.includes('ZH-CN') ||
    transLang === 'ZH' ||
    /【(?:简体中文版|简体中文|简体|汉化|简中|中文)】|\[(?:简体中文|汉化|简中)\]|\((?:简体中文|汉化|简中)\)|\b(?:汉化|简体中文|中文版|简中)\b/i.test(title) ||
    /中文|中国語|汉化|简体/i.test(tagsList)
  ) {
    return { code: 'zh-hans', label: 'CHI-S', flag: '' };
  }

  // 3. Chinese Traditional
  if (
    attrs.includes('CHI_HANT') ||
    transLang.includes('CHI_HANT') ||
    transLang.includes('ZH_TW') ||
    transLang.includes('ZH-TW') ||
    /【(?:繁體中文版|繁體中文|繁体中文|繁体|繁體|繁中)】|\[(?:繁體中文|繁中)\]|\((?:繁體中文|繁中)\)|\b(?:繁體中文|繁体中文|繁體版)\b/i.test(title) ||
    /繁體|繁体/i.test(tagsList)
  ) {
    return { code: 'zh-hant', label: 'CHI-T', flag: '' };
  }

  // 4. Korean
  if (
    attrs.includes('KO_KR') ||
    attrs.includes('KOREAN') ||
    transLang.includes('KO_KR') ||
    transLang === 'KO' ||
    /【(?:한국어|한국어판|한국어버전)】|\[(?:한국어|한국어판)\]|\((?:한국어|한국어판)\)|\b한국어\b/i.test(title) ||
    /한국어|韓国語/i.test(tagsList)
  ) {
    return { code: 'ko', label: 'KOR', flag: '' };
  }

  // 5. Vietnamese
  if (
    attrs.includes('VIE') ||
    attrs.includes('VIETNAMESE') ||
    transLang.includes('VIE') ||
    transLang === 'VI' ||
    /【(?:Tiếng Việt|Vietsub|VI)】|\[(?:Tiếng Việt|Vietsub)\]|\((?:Tiếng Việt|Vietsub)\)|\b(?:tiếng việt|vietsub|vietnamese)\b/i.test(title) ||
    /Tiếng Việt|Vietsub|ベトナム語/i.test(tagsList)
  ) {
    return { code: 'vi', label: 'VIE', flag: '' };
  }

  return { code: 'ja', label: 'JPN', flag: '' };
}

// Helper: Check if work matches target language strictly on its own content
function matchesLanguage(w: any, lang: string): boolean {
  if (!lang || lang === 'all') return true;
  const actualLang = getWorkLanguageLabel(w).code;
  if (lang === 'zh' || lang === 'zh-hans') {
    return actualLang === 'zh-hans';
  }
  if (lang === 'zh-hant') {
    return actualLang === 'zh-hant';
  }
  if (lang === 'en') {
    return actualLang === 'en';
  }
  if (lang === 'ko') {
    return actualLang === 'ko';
  }
  if (lang === 'vi') {
    return actualLang === 'vi';
  }
  if (lang === 'ja') {
    return actualLang === 'ja';
  }
  return actualLang === lang;
}

// Helper: Build targeted upstream query string combining user keywords, tags, and language
function buildUpstreamSearchQuery(query: string = '', tag: string = '', lang: string = 'all'): string {
  const parts: string[] = [];
  const qTrim = (query || '').trim();
  const tagTrim = (tag || '').trim();

  if (qTrim) parts.push(qTrim);
  if (tagTrim && !parts.includes(tagTrim)) parts.push(tagTrim);

  if (lang && lang !== 'all') {
    if (lang === 'en') {
      parts.push('English');
    } else if (lang === 'zh-hans' || lang === 'zh') {
      parts.push('中文');
    } else if (lang === 'zh-hant') {
      parts.push('繁體');
    } else if (lang === 'ko') {
      parts.push('한국어');
    } else if (lang === 'vi') {
      parts.push('tiếng việt');
    }
  }

  return parts.join(' ').trim();
}

const CLASSIC_POPULAR_TAGS = [
  // --- SFW: Triggers & Audio ---
  { id: '耳かき', label: '耳かき / Ear Clean [SFW]' },
  { id: '囁き', label: '囁き / Whisper [SFW]' },
  { id: '吐息', label: '吐息 / Breathing [SFW]' },
  { id: 'マッサージ', label: 'マッサージ / Massage [SFW]' },
  { id: 'オイルマッサージ', label: 'オイルマッサージ / Oil Massage [SFW]' },
  { id: 'ヘッドスパ', label: 'ヘッドスパ / Head Spa [SFW]' },
  { id: 'シャンプー', label: 'シャンプー / Shampoo [SFW]' },
  { id: '心音', label: '心音 / Heartbeat [SFW]' },
  { id: 'オノマトペ', label: 'オノマトペ / Sound FX [SFW]' },
  { id: '耳ふー', label: '耳ふー / Ear Blowing [SFW]' },
  { id: 'タッピング', label: 'タッピング / Tapping [SFW]' },
  { id: '咀嚼音', label: '咀嚼音 / Chewing [SFW]' },
  { id: '泡・炭酸', label: '泡・炭酸 / Bubbles [SFW]' },
  { id: '雨音', label: '雨音 / Rain Sounds [SFW]' },
  { id: '水音', label: '水音 / Water Ambience [SFW]' },
  { id: '焚き火', label: '焚き火 / Campfire [SFW]' },
  { id: '梵天', label: '梵天 / Fluffy Earpick [SFW]' },
  { id: '綿棒', label: '綿棒 / Cotton Swab [SFW]' },
  { id: '竹耳かき', label: '竹耳かき / Bamboo Earpick [SFW]' },
  { id: '粘着綿棒', label: '粘着綿棒 / Adhesive Swab [SFW]' },
  { id: 'スライム', label: 'スライム / Slime [SFW]' },
  { id: 'ブラッシング', label: 'ブラッシング / Hair Brushing [SFW]' },
  { id: '歯磨き', label: '歯磨き / Teeth Brushing [SFW]' },

  // --- SFW: Mood & Scenarios ---
  { id: '安眠', label: '安眠 / Sleep Aid [SFW]' },
  { id: '純愛', label: '純愛 / Pure Love [SFW]' },
  { id: '甘々', label: '甘々 / Pampering [SFW]' },
  { id: '添い寝', label: '添い寝 / Co-sleeping [SFW]' },
  { id: '癒やし', label: '癒やし / Healing [SFW]' },
  { id: 'お風呂', label: 'お風呂 / Bath & Onsen [SFW]' },
  { id: '看病', label: '看病 / Caregiving [SFW]' },
  { id: '同棲', label: '同棲 / Living Together [SFW]' },
  { id: '告白', label: '告白 / Confession [SFW]' },
  { id: '膝枕', label: '膝枕 / Lap Pillow [SFW]' },
  { id: '抱擁', label: '抱擁 / Hugging [SFW]' },
  { id: '朗読', label: '朗読 / Reading [SFW]' },
  { id: '作業用BGM', label: '作業用BGM / Study BGM [SFW]' },
  { id: 'カウンセリング', label: 'カウンセリング / Counseling [SFW]' },

  // --- Characters ---
  { id: 'お姉さん', label: 'お姉さん / Onee-san' },
  { id: '妹', label: '妹 / Sister' },
  { id: '幼馴染', label: '幼馴染 / Friend' },
  { id: '後輩', label: '後輩 / Kouhai' },
  { id: '先輩', label: '先輩 / Senpai' },
  { id: '同級生', label: '同級生 / Classmate' },
  { id: 'ツンデレ', label: 'ツンデレ / Tsundere' },
  { id: 'クーデレ', label: 'クーデレ / Kuudere' },
  { id: 'ヤンデレ', label: 'ヤンデレ / Yandere' },
  { id: '母性', label: '母性・ママ / Mommy' },
  { id: 'メイド', label: 'メイド / Maid' },
  { id: 'ギャル', label: 'ギャル / Gyaru' },
  { id: '女子校生', label: '女子校生 / JK' },
  { id: '看護師', label: '看護師 / Nurse' },
  { id: '女教師', label: '女教師 / Teacher' },
  { id: '女上司', label: '女上司 / Female Boss' },
  { id: 'お嬢様', label: 'お嬢様 / Ojousama' },
  { id: 'ケモミミ', label: 'ケモミミ / Animal Ears' },
  { id: '猫耳', label: '猫耳 / Catgirl' },
  { id: '人妻', label: '人妻 / Married Woman' },
  { id: 'ボクっ娘', label: 'ボクっ娘 / Tomboy' },
  { id: 'VTuber', label: 'VTuber / Streamer' },

  // --- Audio Tech ---
  { id: 'バイノーラル', label: 'バイノーラル / Binaural' },
  { id: 'KU100', label: 'KU100' },
  { id: '3Dio', label: '3Dio FreeSpace' },
  { id: 'ダミーヘッド', label: 'ダミーヘッド / Dummy Head' },
  { id: 'ハイレゾ', label: 'ハイレゾ / Hi-Res' },
  { id: '立体音響', label: '立体音響 / 3D Audio' },

  // --- NSFW (R18 / Adult) Triggers & Actions ---
  { id: '耳舐め', label: '耳舐め / Ear Licking [18+]' },
  { id: '耳奥', label: '耳奥 / Deep Ear [18+]' },
  { id: 'キス', label: 'キス・リップ音 / Kiss [18+]' },
  { id: 'オナサポート', label: 'オナサポート / Guided [18+]' },
  { id: '淫語', label: '淫語 / Dirty Talk [18+]' },
  { id: '喘ぎ声', label: '喘ぎ声 / Moaning [18+]' },
  { id: '言葉責め', label: '言葉責め / Verbal Tease [18+]' },
  { id: 'フェラ', label: 'フェラ / Oral Sounds [18+]' },
  { id: '手コキ', label: '手コキ / Handjob [18+]' },
  { id: 'パイズリ', label: 'パイズリ / Titjob [18+]' },
  { id: '足コキ', label: '足コキ / Footjob [18+]' },
  { id: '焦らし', label: '焦らし / Edging [18+]' },
  { id: '射精管理', label: '射精管理 / Orgasm Control [18+]' },
  { id: '搾精', label: '搾精 / Milking [18+]' },
  { id: '中出し', label: '中出し / Creampie [18+]' },
  { id: '生ハメ', label: '生ハメ / Raw Sex [18+]' },
  { id: '密着', label: '密着 / Body Contact [18+]' },
  { id: '催眠', label: '催眠 / Hypnosis [18+]' },
  { id: '潮吹き', label: '潮吹き / Squirting [18+]' },
  { id: '玩具', label: '玩具・ローター / Toys [18+]' },

  // --- NSFW (R18 / Adult) Tropes & Fetishes ---
  { id: '甘サド', label: '甘サド / Sweet Sadism [18+]' },
  { id: 'ドS', label: 'ドS / Dominant [18+]' },
  { id: 'ドM', label: 'ドM / Masochist [18+]' },
  { id: 'メスガキ', label: 'メスガキ / Brat [18+]' },
  { id: '痴女', label: '痴女 / Lewd [18+]' },
  { id: 'サキュバス', label: 'サキュバス / Succubus [18+]' },
  { id: '巨乳', label: '巨乳 / Big Breasts [18+]' },
  { id: '貧乳', label: '貧乳 / Flat Chest [18+]' },
  { id: '尻', label: '尻 / Butt Play [18+]' },
  { id: 'アナル', label: 'アナル / Anal [18+]' },
  { id: '寝取られ', label: '寝取られ / NTR [18+]' },
  { id: '寝取り', label: '寝取り / NTS [18+]' },
  { id: 'ハーレム', label: 'ハーレム / Harem [18+]' },
  { id: '逆3P', label: '逆3P / Threesome [18+]' },
  { id: '近親相姦', label: '近親相姦 / Incest [18+]' },
  { id: '百合', label: '百合 / Yuri [18+]' },
  { id: '主従', label: '主従 / Master & Servant [18+]' },
  { id: '調教', label: '調教 / Training [18+]' },
  { id: '拘束', label: '拘束 / Bondage [18+]' },
  { id: '触手', label: '触手 / Tentacles [18+]' },
  { id: '睡眠姦', label: '睡眠姦 / Sleep Sex [18+]' },
  { id: '逆レイプ', label: '逆レイプ / Reverse Rape [18+]' },
  { id: '処女喪失', label: '処女喪失 / Virginity Loss [18+]' },
  { id: '童貞卒業', label: '童貞卒業 / Male Virginity [18+]' },
  { id: 'おもらし', label: 'おもらし / Omorashi [18+]' },
  { id: '風俗', label: '風俗 / Soapland [18+]' },
  { id: '催眠音声', label: '催眠音声 / Hypnotic Voice [18+]' },
];

// ==========================================
// REST API ENDPOINTS FOR CLIENT & DOWNLOADS
// ==========================================

// Search API
app.get('/api/search/:query?', async (req: Request, res: Response) => {
  try {
    let query = req.params.query || (req.query.q as string) || '';
    const page = req.query.page || '1';
    const order = (req.query.order as string) || 'release';
    const sort = req.query.sort || 'desc';
    const subtitle = req.query.subtitle;
    const lang = (req.query.lang as string) || 'all';
    const tag = (req.query.tag as string) || '';
    const nsfw = (req.query.nsfw as string) || 'all';

    const targetSearch = buildUpstreamSearchQuery(query, tag, lang);

    let targetUrl = `https://api.asmr.one/api/search/${encodeURIComponent(targetSearch)}?page=${page}&order=${order}&sort=${sort}`;
    if (subtitle !== undefined && subtitle !== '') {
      targetUrl += `&subtitle=${subtitle}`;
    }

    let upstreamRes = await fetch(targetUrl, { headers: ASMR_API_HEADERS });
    let data = upstreamRes.ok ? await upstreamRes.json() : { works: [], pagination: {} };
    let works = data.works || [];

    let filtered = lang && lang !== 'all' ? works.filter((w: any) => matchesLanguage(w, lang)) : works;
    if (tag) filtered = filtered.filter((w: any) => matchesTag(w, tag));

    // If 0 results after filtering and language filter is active, try alternate language search keywords
    if (filtered.length === 0 && lang && lang !== 'all') {
      const altKeywords: Record<string, string[]> = {
        en: ['ENG', '英語', '$ENG', 'English'],
        'zh-hans': ['中文', '汉化', '简体', 'CHI_HANS'],
        'zh-hant': ['繁體', '繁体', 'CHI_HANT'],
        ko: ['한국어', '韓国語', 'KO_KR'],
        vi: ['tiếng việt', 'vietsub', 'vietnamese'],
      };
      const alts = altKeywords[lang] || [];
      for (const alt of alts) {
        if (alt === targetSearch) continue;
        const altQuery = query ? `${query} ${alt}` : tag ? `${tag} ${alt}` : alt;
        let altUrl = `https://api.asmr.one/api/search/${encodeURIComponent(altQuery)}?page=${page}&order=${order}&sort=${sort}`;
        if (subtitle !== undefined && subtitle !== '') altUrl += `&subtitle=${subtitle}`;
        try {
          const altRes = await fetch(altUrl, { headers: ASMR_API_HEADERS });
          if (altRes.ok) {
            const altData = await altRes.json();
            let cand = (altData.works || []).filter((w: any) => matchesLanguage(w, lang));
            if (tag) cand = cand.filter((w: any) => matchesTag(w, tag));
            if (cand.length > 0) {
              filtered = cand;
              data = altData;
              break;
            }
          }
        } catch {}
      }
    }

    if (nsfw === 'sfw') {
      filtered = filtered.filter((w: any) => w.nsfw === false);
    } else if (nsfw === 'nsfw') {
      filtered = filtered.filter((w: any) => w.nsfw === true);
    }

    data.works = filtered;
    return res.json(data);
  } catch (err: any) {
    console.error('Search API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Work details API
app.get('/api/work/:id', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveNumericWorkId(req.params.id);
    if (!resolved) {
      return res.status(404).json({ error: 'Work not found' });
    }

    const targetUrl = `https://api.asmr.one/api/work/${resolved.numericId}`;
    const upstreamRes = await fetch(targetUrl, { headers: ASMR_API_HEADERS });
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({ error: `Upstream error ${upstreamRes.status}` });
    }
    const data = await upstreamRes.json();
    return res.json(data);
  } catch (err: any) {
    console.error('Work API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Tracks tree API
app.get('/api/tracks/:id', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveNumericWorkId(req.params.id);
    if (!resolved) {
      return res.status(404).json({ error: 'Work not found' });
    }

    const targetUrl = `https://api.asmr.one/api/tracks/${resolved.numericId}`;
    const upstreamRes = await fetch(targetUrl, { headers: ASMR_API_HEADERS });
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({ error: `Upstream error ${upstreamRes.status}` });
    }
    const data = await upstreamRes.json();
    return res.json(data);
  } catch (err: any) {
    console.error('Tracks API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Stream/Download Proxy Endpoint
// Supports Range requests for resuming downloads on Symbian and older browsers!
app.get('/api/download/file', async (req: Request, res: Response) => {
  try {
    const targetUrl = req.query.url as string;
    const fileName = (req.query.name as string) || 'download.bin';
    const isAttachment = req.query.inline !== '1';

    if (!targetUrl || !targetUrl.startsWith('http')) {
      return res.status(400).send('Invalid or missing URL parameter');
    }

    const requestHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (SymbianOS/9.4; Series60/5.0 Nokia5800d-1/21.0.025; Profile/MIDP-2.1 Configuration/CLDC-1.1 ) AppleWebKit/525 (KHTML, like Gecko) Version/3.0 Safari/525',
      'Referer': 'https://www.asmr.one/',
    };

    if (req.headers.range) {
      requestHeaders['Range'] = req.headers.range;
    }

    const upstreamRes = await fetch(targetUrl, { headers: requestHeaders });

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      return res.status(upstreamRes.status).send(`Upstream download failed with status ${upstreamRes.status}`);
    }

    const contentType = upstreamRes.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstreamRes.headers.get('content-length');
    const contentRange = upstreamRes.headers.get('content-range');
    const acceptRanges = upstreamRes.headers.get('accept-ranges') || 'bytes';

    res.status(upstreamRes.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', acceptRanges);

    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    if (contentRange) {
      res.setHeader('Content-Range', contentRange);
    }

    const disposition = isAttachment ? 'attachment' : 'inline';
    // RFC 5987 filename encoding for non-ASCII Japanese titles
    const asciiSafe = fileName.replace(/[^\x20-\x7E]/g, '_');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${asciiSafe}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );

    // Disable caching on proxy downloads
    res.setHeader('Cache-Control', 'no-cache');

    if (!upstreamRes.body) {
      return res.end();
    }

    // Convert Web ReadableStream to Node stream and pipe
    // @ts-ignore
    const { Readable } = await import('stream');
    // @ts-ignore
    const nodeStream = Readable.fromWeb(upstreamRes.body);
    nodeStream.pipe(res);
  } catch (err: any) {
    console.error('File download proxy error:', err);
    if (!res.headersSent) {
      res.status(500).send('File streaming proxy error');
    }
  }
});

// Download M3U Playlist for Symbian RealPlayer / CorePlayer
app.get('/api/download/playlist.m3u', async (req: Request, res: Response) => {
  try {
    const workId = req.query.id as string;
    if (!workId) return res.status(400).send('Missing work id');

    const resolved = await resolveNumericWorkId(workId);
    if (!resolved) return res.status(404).send('Work not found');

    const [tracksRes, workRes] = await Promise.all([
      fetch(`https://api.asmr.one/api/tracks/${resolved.numericId}`, { headers: ASMR_API_HEADERS }),
      fetch(`https://api.asmr.one/api/work/${resolved.numericId}`, { headers: ASMR_API_HEADERS }).catch(() => null),
    ]);

    if (!tracksRes.ok) return res.status(tracksRes.status).send('Failed to fetch tracks');
    const tracksData = await tracksRes.json();
    const workData = workRes && workRes.ok ? await workRes.json() : null;

    const flattened = flattenTracks(tracksData).filter((t) => t.type === 'audio' && (t.mediaStreamUrl || t.mediaDownloadUrl));

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || `localhost:${PORT}`;
    const baseUrl = `${protocol}://${host}`;

    let m3uContent = '#EXTM3U\n';
    m3uContent += `#PLAYLIST:${workData?.title || 'ASMR Work ' + resolved.numericId}\n\n`;

    for (const track of flattened) {
      const duration = Math.round(track.duration || -1);
      const title = track.title.replace(/[\r\n]/g, '');
      const downloadProxyUrl = `${baseUrl}/api/download/file?url=${encodeURIComponent(
        track.mediaDownloadUrl || track.mediaStreamUrl || ''
      )}&name=${encodeURIComponent(track.title)}`;

      m3uContent += `#EXTINF:${duration},${title}\n`;
      m3uContent += `${downloadProxyUrl}\n\n`;
    }

    const rjCode = workData?.source_id || `RJ${resolved.numericId}`;
    res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${rjCode}_playlist.m3u"`);
    return res.send(m3uContent);
  } catch (err: any) {
    console.error('M3U playlist error:', err);
    return res.status(500).send('Error generating M3U playlist');
  }
});

// Download Batch URLs text file (for IDM, Aria2, Wget, Symbian download managers)
app.get('/api/download/batch-links.txt', async (req: Request, res: Response) => {
  try {
    const workId = req.query.id as string;
    if (!workId) return res.status(400).send('Missing work id');

    const resolved = await resolveNumericWorkId(workId);
    if (!resolved) return res.status(404).send('Work not found');

    const tracksRes = await fetch(`https://api.asmr.one/api/tracks/${resolved.numericId}`, { headers: ASMR_API_HEADERS });
    if (!tracksRes.ok) return res.status(tracksRes.status).send('Failed to fetch tracks');
    const tracksData = await tracksRes.json();

    const flattened = flattenTracks(tracksData);
    let output = `# ASMR Work ${resolved.numericId} Download Links\n# Generated for Aria2, Wget, curl, IDM, Symbian\n\n`;

    for (const track of flattened) {
      const url = track.mediaDownloadUrl || track.mediaStreamUrl;
      if (url) {
        output += `# [${track.type.toUpperCase()}] ${track.path} (${formatBytes(track.size)})\n`;
        output += `${url}\n\n`;
      }
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="links_${resolved.numericId}.txt"`);
    return res.send(output);
  } catch (err: any) {
    console.error('Batch links error:', err);
    return res.status(500).send('Error generating batch links');
  }
});

// Download Batch Shell script (curl / wget)
app.get('/api/download/batch-script.sh', async (req: Request, res: Response) => {
  try {
    const workId = req.query.id as string;
    if (!workId) return res.status(400).send('Missing work id');

    const resolved = await resolveNumericWorkId(workId);
    if (!resolved) return res.status(404).send('Work not found');

    const tracksRes = await fetch(`https://api.asmr.one/api/tracks/${resolved.numericId}`, { headers: ASMR_API_HEADERS });
    if (!tracksRes.ok) return res.status(tracksRes.status).send('Failed to fetch tracks');
    const tracksData = await tracksRes.json();

    const flattened = flattenTracks(tracksData);
    let script = `#!/bin/bash\n# Batch downloader for ASMR Work ${resolved.numericId}\nset -e\n\n`;
    script += `TARGET_DIR="ASMR_${resolved.numericId}"\nmkdir -p "$TARGET_DIR"\ncd "$TARGET_DIR"\n\necho "Starting download..."\n\n`;

    for (const track of flattened) {
      const url = track.mediaDownloadUrl || track.mediaStreamUrl;
      if (url) {
        const safeDir = path.dirname(track.path);
        const fileName = path.basename(track.path);
        if (safeDir && safeDir !== '.') {
          script += `mkdir -p "${safeDir}"\n`;
        }
        script += `echo "Downloading: ${track.path}"\n`;
        script += `curl -C - -L -o "${track.path}" "${url}"\n\n`;
      }
    }
    script += `echo "All downloads completed successfully!"\n`;

    res.setHeader('Content-Type', 'application/x-sh; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="download_${resolved.numericId}.sh"`);
    return res.send(script);
  } catch (err: any) {
    console.error('Batch script error:', err);
    return res.status(500).send('Error generating shell script');
  }
});

// Download Zip Stream on the fly (Reworked for maximum reliability & error resilience)
app.get('/api/download/zip/:id', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveNumericWorkId(req.params.id);
    if (!resolved) return res.status(404).send('Work not found');

    const [tracksRes, workRes] = await Promise.all([
      fetch(`https://api.asmr.one/api/tracks/${resolved.numericId}`, { headers: ASMR_API_HEADERS }),
      fetch(`https://api.asmr.one/api/work/${resolved.numericId}`, { headers: ASMR_API_HEADERS }).catch(() => null),
    ]);

    if (!tracksRes.ok) return res.status(tracksRes.status).send('Failed to fetch tracks');
    const tracksData = await tracksRes.json();
    const workData = workRes && workRes.ok ? await workRes.json() : null;

    const flattened = flattenTracks(tracksData).filter((t) => t.mediaDownloadUrl || t.mediaStreamUrl);
    if (flattened.length === 0) {
      return res.status(404).send('No downloadable files found in this work');
    }

    const rjCode = workData?.source_id || `RJ${resolved.numericId}`;
    const archive = archiver('zip', {
      zlib: { level: 0 }, // Store mode for maximum speed and minimum CPU load
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(rjCode)}_archive.zip"`);

    archive.on('warning', (wErr: any) => {
      console.warn('Archiver warning:', wErr);
    });

    archive.on('error', (err: any) => {
      console.error('Archiver fatal error:', err);
      if (!res.headersSent) {
        res.status(500).send('Zip generation failed');
      }
    });

    archive.pipe(res);

    const downloadHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Referer': 'https://www.asmr.one/',
    };

    const downloadLogs: string[] = [`ASMR Archive Download Log - Work ${rjCode}`];

    // Download files sequentially and append safely to zip archive
    for (const track of flattened) {
      const url = track.mediaDownloadUrl || track.mediaStreamUrl;
      if (!url) continue;

      const cleanPath = (track.path || track.title || 'file')
        .replace(/\\/g, '/')
        .replace(/^\/+/, '');

      try {
        const fileRes = await fetch(url, {
          headers: downloadHeaders,
          signal: AbortSignal.timeout(30000), // 30s timeout per file
        });

        if (fileRes.ok) {
          const contentLength = Number(fileRes.headers.get('content-length') || 0);
          // For files under 25MB, fetch arrayBuffer into Buffer for instant, error-proof append
          if (contentLength > 0 && contentLength < 25 * 1024 * 1024) {
            const arrayBuf = await fileRes.arrayBuffer();
            archive.append(Buffer.from(arrayBuf), { name: cleanPath });
            downloadLogs.push(`[OK] ${cleanPath} (${arrayBuf.byteLength} bytes)`);
          } else if (fileRes.body) {
            // For larger files, convert Web ReadableStream to Node Readable with error trapping
            // @ts-ignore
            const { Readable } = await import('stream');
            // @ts-ignore
            const nodeStream = Readable.fromWeb(fileRes.body);
            nodeStream.on('error', (sErr: any) => {
              console.warn(`Stream error on file ${cleanPath}:`, sErr);
            });

            await new Promise<void>((resolve) => {
              archive.append(nodeStream, { name: cleanPath });
              setImmediate(resolve);
            });
            downloadLogs.push(`[OK - Streamed] ${cleanPath}`);
          }
        } else {
          const errMsg = `HTTP ${fileRes.status} ${fileRes.statusText}`;
          console.warn(`Failed to fetch ${cleanPath}: ${errMsg}`);
          downloadLogs.push(`[FAILED ${errMsg}] ${cleanPath}`);
          archive.append(`Failed to download ${cleanPath}.\nURL: ${url}\nError: ${errMsg}`, {
            name: `${cleanPath}.download_error.txt`,
          });
        }
      } catch (fErr: any) {
        console.warn(`Exception downloading ${cleanPath}:`, fErr?.message || fErr);
        downloadLogs.push(`[ERROR] ${cleanPath}: ${fErr?.message || 'Download exception'}`);
        archive.append(`Failed to download ${cleanPath}.\nURL: ${url}\nError: ${fErr?.message || 'Network exception'}`, {
          name: `${cleanPath}.download_error.txt`,
        });
      }
    }

    // Append download summary log to archive
    archive.append(downloadLogs.join('\n'), { name: '_download_summary.txt' });

    await archive.finalize();
  } catch (err: any) {
    console.error('Zip download endpoint error:', err);
    if (!res.headersSent) {
      res.status(500).send('Zip generation failed');
    }
  }
});

// ==========================================
// SCRIPT TRANSLATION API (PRODUCTION & SSR)
// ==========================================

// POST /api/translate (Translate script text payload)
app.post('/api/translate', async (req: Request, res: Response) => {
  try {
    const { text, targetLang = 'en', sourceLang, mode = 'translated', tone = 'asmr' } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing text in request body' });
    }

    const result = await translateScript(text, { targetLang, sourceLang, mode, tone });
    return res.json(result);
  } catch (err: any) {
    console.error('Translation error:', err);
    return res.status(500).json({ error: 'Translation failed', details: err.message });
  }
});

// GET /api/translate (Translate script directly from upstream URL)
app.get('/api/translate', async (req: Request, res: Response) => {
  try {
    const targetUrl = req.query.url as string;
    const targetLang = (req.query.targetLang as string) || (req.query.lang as string) || 'en';
    const mode = (req.query.mode as any) || 'translated';
    const tone = (req.query.tone as any) || 'asmr';

    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    const upstreamRes = await fetch(targetUrl, { headers: ASMR_API_HEADERS });
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({ error: 'Failed to fetch script text from upstream' });
    }

    const text = await upstreamRes.text();
    const result = await translateScript(text, { targetLang, mode, tone });
    return res.json(result);
  } catch (err: any) {
    console.error('Translation URL error:', err);
    return res.status(500).json({ error: 'Failed to translate script', details: err.message });
  }
});

// GET /api/download/translated-script (Download translated text file)
app.get('/api/download/translated-script', async (req: Request, res: Response) => {
  try {
    const targetUrl = req.query.url as string;
    const targetLang = (req.query.targetLang as string) || (req.query.lang as string) || 'en';
    const mode = (req.query.mode as any) || 'translated';
    const tone = (req.query.tone as any) || 'asmr';
    const originalName = (req.query.name as string) || 'script.txt';

    if (!targetUrl) {
      return res.status(400).send('Missing url parameter');
    }

    const upstreamRes = await fetch(targetUrl, { headers: ASMR_API_HEADERS });
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send('Failed to fetch script');
    }

    const text = await upstreamRes.text();
    const cacheKey = getScriptCacheKey(text, { targetLang, mode });
    const cached = getCachedScriptTranslation(cacheKey);
    let textToSend = cached ? cached.translatedText : '';
    if (!textToSend) {
      const result = await translateScript(text, { targetLang, mode, tone });
      textToSend = result.translatedText;
    }

    const safeBase = path.basename(originalName).replace(/\.[^/.]+$/, '');
    const downloadFilename = `${safeBase}_${targetLang}_${mode}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFilename)}"`);
    return res.send(textToSend);
  } catch (err: any) {
    console.error('Download translation error:', err);
    return res.status(500).send('Translation download error: ' + err.message);
  }
});

// POST /api/translate/titles (Batch translate work titles and track names)
app.post('/api/translate/titles', async (req: Request, res: Response) => {
  try {
    const { texts, targetLang = 'en' } = req.body;
    if (!texts || !Array.isArray(texts)) {
      return res.status(400).json({ error: 'texts must be an array of strings' });
    }
    const cleanLang = targetLang === 'vi' ? 'vi' : 'en';
    const result = await translateTitles(texts, cleanLang);
    return res.json(result);
  } catch (err: any) {
    console.error('Batch title translation error:', err);
    return res.status(500).json({ error: 'Failed to translate titles', details: err.message });
  }
});

// GET /api/translate/titles (Single or query-based title translation)
app.get('/api/translate/titles', async (req: Request, res: Response) => {
  try {
    const text = (req.query.text as string) || '';
    const targetLang = (req.query.targetLang as string) === 'vi' ? 'vi' : 'en';
    if (!text.trim()) {
      return res.status(400).json({ error: 'Missing text parameter' });
    }
    const result = await translateTitles([text], targetLang);
    return res.json(result);
  } catch (err: any) {
    console.error('Single title translation error:', err);
    return res.status(500).json({ error: 'Failed to translate title', details: err.message });
  }
});

// POST /api/translate/cache-upload (Upload client-translated titles to server cache & permanent vault)
app.post('/api/translate/cache-upload', (req: Request, res: Response) => {
  try {
    // SECURITY CHECK: Verify no API keys are ever stored or processed on the server
    if (req.body && typeof req.body === 'object') {
      const sensitiveKeys = ['apiKey', 'api_key', 'key', 'geminiKey', 'gemini_api_key', 'token'];
      for (const k of sensitiveKeys) {
        if (req.body[k]) {
          delete req.body[k];
          console.warn(`[Security Audit] Stripped unexpected field "${k}" from /api/translate/cache-upload. Translation API keys must remain strictly client-side.`);
        }
      }
    }

    const { translations, targetLang = 'en', workInfo } = req.body;
    if (!translations || typeof translations !== 'object') {
      return res.status(400).json({ error: 'translations must be an object' });
    }
    const cleanLang = targetLang === 'vi' ? 'vi' : 'en';
    const result = uploadTitleTranslations(translations, cleanLang, workInfo);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Cache upload error:', err);
    return res.status(500).json({ error: 'Failed to upload cache', details: err.message });
  }
});

// POST /api/translate/cached-titles (Query server cache for already translated titles)
app.post('/api/translate/cached-titles', (req: Request, res: Response) => {
  try {
    const { texts, targetLang = 'en' } = req.body;
    if (!texts || !Array.isArray(texts)) {
      return res.status(400).json({ error: 'texts must be an array of strings' });
    }
    const cleanLang = targetLang === 'vi' ? 'vi' : 'en';
    const result = getCachedTitlesBatch(texts, cleanLang);
    return res.json(result);
  } catch (err: any) {
    console.error('Cache query error:', err);
    return res.status(500).json({ error: 'Failed to query cache', details: err.message });
  }
});

// POST /api/translate/check-work (Check if a work title and all its tracks are already translated)
app.post('/api/translate/check-work', (req: Request, res: Response) => {
  try {
    const { workIdOrRj = '', originalTitle = '', trackTitles = [], targetLang = 'en' } = req.body;
    const cleanLang = targetLang === 'vi' ? 'vi' : 'en';
    const tracks = Array.isArray(trackTitles) ? trackTitles : [];
    const status = checkWorkTranslationStatus(workIdOrRj, originalTitle, tracks, cleanLang);
    return res.json(status);
  } catch (err: any) {
    console.error('Work translation check error:', err);
    return res.status(500).json({ error: 'Failed to check work translation status', details: err.message });
  }
});

// GET /api/translate/works (Retrieve all permanently translated works for the Translated Page)
app.get('/api/translate/works', (req: Request, res: Response) => {
  try {
    const lang = (req.query.lang as any) || 'all';
    const q = (req.query.q as string) || '';
    const cleanLang = lang === 'en' || lang === 'vi' ? lang : 'all';
    const works = getPermanentTranslatedWorks(cleanLang, q);
    const stats = getPermanentTranslationStats();
    return res.json({ works, total: works.length, stats });
  } catch (err: any) {
    console.error('Failed to retrieve permanent translated works:', err);
    return res.status(500).json({ error: 'Failed to retrieve translated works', details: err.message });
  }
});

// GET /api/translate/works/:id (Retrieve a single permanently translated work record)
app.get('/api/translate/works/:id', (req: Request, res: Response) => {
  try {
    const work = getPermanentTranslatedWork(req.params.id);
    if (!work) {
      return res.status(404).json({ error: 'Translated work not found in permanent vault' });
    }
    return res.json(work);
  } catch (err: any) {
    console.error('Failed to retrieve translated work by id:', err);
    return res.status(500).json({ error: 'Failed to retrieve translated work', details: err.message });
  }
});

// GET /api/translate/cache-stats (Server-side translation cache statistics)
app.get('/api/translate/cache-stats', (_req: Request, res: Response) => {
  return res.json(getServerTranslationCacheStats());
});

// GET /api/translate/vault-stats (Permanent translated works vault statistics)
app.get('/api/translate/vault-stats', (_req: Request, res: Response) => {
  return res.json(getPermanentTranslationStats());
});

// POST /api/translate/script-cache (Check if a script is already translated in server cache)
app.post('/api/translate/script-cache', (req: Request, res: Response) => {
  try {
    const { hash = '', text = '', targetLang = 'en', mode = 'translated' } = req.body;
    const cacheKey = getScriptCacheKey(hash || text, { targetLang, mode });
    const cached = getCachedScriptTranslation(cacheKey);
    if (cached) {
      return res.json({ cached: true, cacheKey, ...cached });
    }
    return res.json({ cached: false, cacheKey });
  } catch (err: any) {
    console.error('Script cache check error:', err);
    return res.status(500).json({ error: 'Failed to check script cache', details: err.message });
  }
});

// POST /api/translate/script-upload (Upload client-translated script to server cache & permanent disk storage)
app.post('/api/translate/script-upload', (req: Request, res: Response) => {
  try {
    // SECURITY AUDIT: Verify no API keys are ever stored or processed on the server
    if (req.body && typeof req.body === 'object') {
      const sensitiveKeys = ['apiKey', 'api_key', 'key', 'geminiKey', 'gemini_api_key', 'token'];
      for (const k of sensitiveKeys) {
        if (req.body[k]) {
          delete req.body[k];
          console.warn(`[Security Audit] Stripped unexpected field "${k}" from /api/translate/script-upload. Translation API keys must remain strictly client-side.`);
        }
      }
    }

    const { cacheKey, hash, text, targetLang = 'en', mode = 'translated', translatedText, sourceLang, workId } = req.body;
    if (!translatedText || typeof translatedText !== 'string') {
      return res.status(400).json({ error: 'translatedText must be a non-empty string' });
    }

    const result = uploadScriptTranslation({
      cacheKey,
      hash,
      rawText: text,
      targetLang,
      mode,
      translatedText,
      sourceLang,
      workId,
    });

    return res.json(result);
  } catch (err: any) {
    console.error('Script upload error:', err);
    return res.status(500).json({ error: 'Failed to upload script translation', details: err.message });
  }
});

// ============================================================================
// RETRO / OPERA MINI / SYMBIAN OS SERVER-SIDE RENDERED (SSR) ENGINE (/classic)
// ============================================================================
// Built strictly with HTML4/HTML5 transitional, 100% functional WITHOUT Javascript.
// Supports Opera Mini 4, 5, 6, 7, 8, S60 WebKit, RealPlayer streaming & direct download.

function escapeHtml(str: string = ''): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Compact, authentic Nokia Symbian / Opera Mini styling (less than 2KB total CSS)
function getRetroCss(): string {
  return `
    body {
      background-color: #f0f2f5;
      color: #111827;
      font-family: Tahoma, Arial, Helvetica, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      margin: 0;
      padding: 6px;
    }
    .wrapper {
      max-width: 680px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #c5cbd5;
    }
    .header {
      background: #cc0000; /* Opera Red */
      color: #ffffff;
      padding: 8px 10px;
      font-size: 14px;
      font-weight: bold;
    }
    .header a {
      color: #ffffff;
      text-decoration: none;
    }
    .subnav {
      background: #e4e7eb;
      border-bottom: 1px solid #c5cbd5;
      padding: 6px 10px;
      font-size: 11px;
    }
    .subnav a {
      color: #0b57d0;
      text-decoration: underline;
      margin-right: 8px;
    }
    .content {
      padding: 8px 10px;
    }
    .search-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 8px;
      margin-bottom: 10px;
    }
    input[type="text"] {
      width: 80%;
      max-width: 280px;
      padding: 4px;
      border: 1px solid #94a3b8;
      font-size: 12px;
      font-family: inherit;
    }
    input[type="submit"], .btn {
      background: #0284c7;
      color: #ffffff;
      border: 1px solid #0369a1;
      padding: 4px 8px;
      font-size: 12px;
      font-weight: bold;
      text-decoration: none;
      cursor: pointer;
      display: inline-block;
    }
    .btn-green {
      background: #16a34a;
      border-color: #15803d;
    }
    .btn-amber {
      background: #d97706;
      border-color: #b45309;
    }
    .btn-red {
      background: #dc2626;
      border-color: #b91c1c;
    }
    .btn-sm {
      font-size: 11px;
      padding: 2px 5px;
    }
    .work-item {
      border-bottom: 1px dotted #cbd5e1;
      padding: 8px 0;
    }
    .work-title {
      font-size: 13px;
      font-weight: bold;
      color: #0f172a;
      margin-bottom: 3px;
    }
    .work-title a {
      color: #0284c7;
      text-decoration: none;
    }
    .work-title a:hover {
      text-decoration: underline;
    }
    .meta-tag {
      font-size: 11px;
      color: #475569;
    }
    .badge {
      display: inline-block;
      background: #e2e8f0;
      color: #334155;
      padding: 1px 4px;
      font-size: 10px;
      margin-right: 4px;
      border-radius: 2px;
    }
    .badge-rj {
      background: #fee2e2;
      color: #b91c1c;
      font-weight: bold;
    }
    .badge-rating {
      background: #fef3c7;
      color: #92400e;
      font-weight: bold;
    }
    .track-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    .track-table th {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
      text-align: left;
      font-size: 11px;
    }
    .track-table td {
      border: 1px solid #e2e8f0;
      padding: 4px 6px;
      font-size: 11px;
    }
    .folder-row {
      background: #f8fafc;
      font-weight: bold;
      color: #334155;
    }
    .footer {
      background: #f1f5f9;
      border-top: 1px solid #cbd5e1;
      padding: 8px 10px;
      font-size: 10px;
      color: #64748b;
      text-align: center;
    }
    .footer a {
      color: #0284c7;
    }
    .pagination {
      margin: 10px 0;
      padding: 6px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      text-align: center;
      font-size: 12px;
    }
    .pagination a {
      color: #0284c7;
      margin: 0 6px;
      text-decoration: underline;
      font-weight: bold;
    }
    .info-box {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      padding: 6px 8px;
      margin: 6px 0;
      font-size: 11px;
      color: #1e3a8a;
    }
    .device-indicator {
      float: right;
      font-size: 10px;
      background: #b91c1c;
      color: #ffffff;
      padding: 1px 4px;
    }
  `;
}

// Retro SSR Layout Template (Main Application Interface)
function renderRetroPage(title: string, bodyContent: string, activeQuery: string = '', imgMode: string = '1', langMode: string = 'all', tagMode: string = ''): string {
  return `<!DOCTYPE html PUBLIC "-//WAPFORUM//DTD XHTML Mobile 1.0//EN" "http://www.wapforum.org/DTD/xhtml-mobile10.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=2.0" />
  <title>${escapeHtml(title)} - RetroASMR</title>
  <style type="text/css">
    ${getRetroCss()}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <a href="/?img=${imgMode}&lang=${langMode}">RetroASMR</a>
    </div>
    <div class="subnav">
      <a href="/?img=${imgMode}&lang=${langMode}">[Home]</a>
      <a href="/translated?img=${imgMode}&lang=${langMode}" style="color:#b91c1c; font-weight:bold;">[★ Translated Vault]</a>
      <a href="/search?tag=耳かき&img=${imgMode}&lang=${langMode}">[Ear Clean]</a>
      <a href="/search?tag=囁き&img=${imgMode}&lang=${langMode}">[Whisper]</a>
      <a href="/search?tag=マッサージ&img=${imgMode}&lang=${langMode}">[Massage]</a>
      <a href="/search?tag=安眠&img=${imgMode}&lang=${langMode}">[Sleep]</a>
      <a href="/search?tag=純愛&img=${imgMode}&lang=${langMode}">[Pure Love]</a>
      <a href="/search?tag=バイノーラル&img=${imgMode}&lang=${langMode}">[Binaural]</a>
      ${tagMode ? `| Tag: <strong style="color:#b91c1c;">#${escapeHtml(tagMode)}</strong> <a href="/search?q=${encodeURIComponent(activeQuery)}&img=${imgMode}&lang=${langMode}">[Clear]</a>` : ''}
      | Img:
      ${imgMode === '0' ? '<strong>No Img</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=0&lang=${langMode}">[No Img]</a>`}
      ${imgMode === '1' ? '<strong>240px</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=1&lang=${langMode}">[240px]</a>`}
      | Lang:
      ${langMode === 'all' ? '<strong>All</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=all">[All]</a>`}
      ${langMode === 'ja' ? '<strong>JP</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=ja">[JP]</a>`}
      ${langMode === 'zh-hans' ? '<strong>CHI-S</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=zh-hans">[CHI-S]</a>`}
      ${langMode === 'zh-hant' ? '<strong>CHI-T</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=zh-hant">[CHI-T]</a>`}
      ${langMode === 'en' ? '<strong>EN</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=en">[EN]</a>`}
      ${langMode === 'vi' ? '<strong>VI</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=vi">[VI]</a>`}
    </div>
    <div class="content">
      ${bodyContent}
    </div>
    <div class="footer">
      <a href="/?img=${imgMode}&lang=${langMode}">RetroASMR</a> &bull; <a href="/?img=${imgMode}&lang=${langMode}">Back to Top</a>
    </div>
  </div>
</body>
</html>`;
}

// Controller: Home Page
async function handleHomeRequest(req: Request, res: Response) {
  const imgMode = (req.query.img as string) || '1';
  const langMode = (req.query.lang as string) || 'all';
  const tagMode = (req.query.tag as string) || '';
  const order = (req.query.order as string) || 'release';
  const sort = (req.query.sort as string) || 'desc';

  let popularHtml = '';
  try {
    const targetSearch = buildUpstreamSearchQuery('', tagMode, langMode);

    let popRes = await fetch(`https://api.asmr.one/api/search/${encodeURIComponent(targetSearch)}?order=${order}&sort=${sort}&page=1`, {
      headers: ASMR_API_HEADERS,
    });
    let works: any[] = [];
    if (popRes.ok) {
      const data = await popRes.json();
      works = data.works || [];
    }

    let filtered = langMode !== 'all' ? works.filter((w: any) => matchesLanguage(w, langMode)) : works;
    if (tagMode) filtered = filtered.filter((w: any) => matchesTag(w, tagMode));

    // If 0 results after filtering and language filter is active, try alternate language search keywords
    if (filtered.length === 0 && langMode !== 'all') {
      const altKeywords: Record<string, string[]> = {
        en: ['ENG', '英語', '$ENG', 'English'],
        'zh-hans': ['中文', '汉化', '简体', 'CHI_HANS'],
        'zh-hant': ['繁體', '繁体', 'CHI_HANT'],
        ko: ['한국어', '韓国語', 'KO_KR'],
        vi: ['tiếng việt', 'vietsub', 'vietnamese'],
      };
      const alts = altKeywords[langMode] || [];
      for (const alt of alts) {
        if (alt === targetSearch) continue;
        const altQuery = tagMode ? `${tagMode} ${alt}` : alt;
        try {
          const altRes = await fetch(`https://api.asmr.one/api/search/${encodeURIComponent(altQuery)}?order=${order}&sort=${sort}&page=1`, {
            headers: ASMR_API_HEADERS,
          });
          if (altRes.ok) {
            const altData = await altRes.json();
            let cand = (altData.works || []).filter((w: any) => matchesLanguage(w, langMode));
            if (tagMode) cand = cand.filter((w: any) => matchesTag(w, tagMode));
            if (cand.length > 0) {
              filtered = cand;
              break;
            }
          }
        } catch {}
      }
    }

    works = filtered.slice(0, 12);
    const sortTitle = order === 'release' ? 'Recent Releases' : order === 'dl_count' ? 'Top Downloaded' : order === 'rating' ? 'Highest Rated' : 'Recently Added';
    popularHtml = `<h3>${sortTitle} ${tagMode ? `(#${escapeHtml(tagMode)})` : ''} (${langMode.toUpperCase()})</h3>`;

    if (works.length === 0) {
      popularHtml += '<p>No matching works found for this filter.</p>';
    }

    for (const w of works) {
      const coverHtml =
        imgMode !== '0' && w.thumbnailCoverUrl
          ? `<div style="margin: 4px 0;"><img src="${escapeHtml(
              w.thumbnailCoverUrl
            )}" width="120" height="120" alt="Cover" style="border:1px solid #ccc;" /></div>`
          : '';

      const vaNames = (w.vas || []).map((v: any) => v.name).join(', ') || 'N/A';
      const langInfo = getWorkLanguageLabel(w);

      let editionsHtml = '';
      const edList = getLanguageEditions(w);
      if (edList.length > 0) {
        editionsHtml = `<div style="font-size:10px; margin-top:2px; color:#475569;">
          Editions: ${edList.map((ed: any) => `<a href="/work/${encodeURIComponent(ed.workno)}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[${escapeHtml(ed.label)}: ${escapeHtml(ed.workno)}]</a>`).join(' ')}
        </div>`;
      }

      const tagsHtml = (w.tags && w.tags.length > 0)
        ? `<div class="meta-tag" style="margin-top:2px;">Tags: ${w.tags.slice(0, 5).map((t: any) => `<a href="/search?tag=${encodeURIComponent(t.name)}&img=${imgMode}&lang=${langMode}&order=${order}" style="color:#0284c7; text-decoration:underline; margin-right:3px;">[#${escapeHtml(t.name)}]</a>`).join(' ')}</div>`
        : '';

      popularHtml += `
        <div class="work-item">
          <span class="badge badge-rj">${escapeHtml(w.source_id || 'RJ' + w.id)}</span>
          <span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">${escapeHtml(langInfo.label)}</span>
          <span class="badge badge-rating">Rating: ${escapeHtml(String(w.rate_average_2dp || '0'))}</span>
          <div class="work-title">
            <a href="/work/${encodeURIComponent(w.source_id || w.id)}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">${escapeHtml(w.title)}</a>
          </div>
          ${coverHtml}
          <div class="meta-tag">
            Circle: <strong>${escapeHtml(w.name || 'N/A')}</strong> | CV: ${escapeHtml(vaNames)}<br />
            DLs: ${escapeHtml(String(w.dl_count || 0))} | Released: ${escapeHtml(w.release || 'N/A')}
          </div>
          ${tagsHtml}
          ${editionsHtml}
          <div style="margin-top: 4px;">
            <a href="/work/${encodeURIComponent(w.source_id || w.id)}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}" class="btn btn-sm">[View Tracks]</a>
            <a href="/api/download/playlist.m3u?id=${w.id}" class="btn btn-green btn-sm">[M3U Playlist]</a>
          </div>
        </div>
      `;
    }
  } catch (err) {
    popularHtml = '<p style="color:red;">Could not load works list.</p>';
  }

  const allPopularTags = [...CLASSIC_POPULAR_TAGS];
  if (tagMode && !allPopularTags.some((t) => t.id === tagMode || t.id.toLowerCase() === tagMode.toLowerCase())) {
    allPopularTags.unshift({ id: tagMode, label: `#${tagMode}` });
  }
  const tagSelectOptions = allPopularTags.map(
    (t) => `<option value="${escapeHtml(t.id)}" ${tagMode === t.id ? 'selected' : ''}>${escapeHtml(t.label)}</option>`
  ).join('');

  const content = `
    <div style="font-size:11px; margin-bottom:6px; background:#f1f5f9; padding:5px 8px; border:1px solid #cbd5e1;">
      <strong>Sort:</strong> 
      ${order === 'release' ? '<strong style="color:#b91c1c;">[Recent]</strong>' : `<a href="/?order=release&img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[Recent]</a>`} |
      ${order === 'dl_count' ? '<strong style="color:#b91c1c;">[Top DLs]</strong>' : `<a href="/?order=dl_count&img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[Top DLs]</a>`} |
      ${order === 'rating' ? '<strong style="color:#b91c1c;">[Top Rated]</strong>' : `<a href="/?order=rating&img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[Top Rated]</a>`} |
      ${order === 'create_date' ? '<strong style="color:#b91c1c;">[New Added]</strong>' : `<a href="/?order=create_date&img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[New Added]</a>`}
    </div>

    <div class="search-box">
      <form action="/search" method="GET">
        <input type="hidden" name="img" value="${escapeHtml(imgMode)}" />
        <input type="text" id="q" name="q" placeholder="RJ code or keyword" value="" style="margin-bottom:4px;" /><br />
        
        <label for="order"><strong>Sort:</strong></label>
        <select name="order" id="order" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="release" ${order === 'release' ? 'selected' : ''}>Recent</option>
          <option value="dl_count" ${order === 'dl_count' ? 'selected' : ''}>Top Downloads</option>
          <option value="rating" ${order === 'rating' ? 'selected' : ''}>Rating</option>
          <option value="create_date" ${order === 'create_date' ? 'selected' : ''}>New Added</option>
          <option value="review_count" ${order === 'review_count' ? 'selected' : ''}>Reviews</option>
        </select>

        <label for="lang"><strong>Lang:</strong></label>
        <select name="lang" id="lang" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="all" ${langMode === 'all' ? 'selected' : ''}>All Languages</option>
          <option value="ja" ${langMode === 'ja' ? 'selected' : ''}>Japanese (JP)</option>
          <option value="zh-hans" ${langMode === 'zh-hans' ? 'selected' : ''}>Simplified Chinese (CHI-S)</option>
          <option value="zh-hant" ${langMode === 'zh-hant' ? 'selected' : ''}>Traditional Chinese (CHI-T)</option>
          <option value="en" ${langMode === 'en' ? 'selected' : ''}>English (ENG)</option>
          <option value="vi" ${langMode === 'vi' ? 'selected' : ''}>Vietnamese (VIE)</option>
          <option value="ko" ${langMode === 'ko' ? 'selected' : ''}>Korean (KOR)</option>
        </select>

        <label for="tag"><strong>Tag:</strong></label>
        <select name="tag" id="tag" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="">All Tags</option>
          ${tagSelectOptions}
        </select>
        <input type="submit" value="Search" />
      </form>
      <div style="font-size:11px; margin-top:5px; color:#475569;">
        Quick: 
        <a href="/search?tag=耳かき&img=${imgMode}&lang=${langMode}&order=${order}">[耳かき]</a>
        <a href="/search?tag=囁き&img=${imgMode}&lang=${langMode}&order=${order}">[囁き]</a>
        <a href="/search?tag=耳舐め&img=${imgMode}&lang=${langMode}&order=${order}">[耳舐め(18+)]</a>
        <a href="/search?tag=オナサポート&img=${imgMode}&lang=${langMode}&order=${order}">[オナサポ(18+)]</a>
        <a href="/search?tag=安眠&img=${imgMode}&lang=${langMode}&order=${order}">[安眠]</a>
        <a href="/search?tag=純愛&img=${imgMode}&lang=${langMode}&order=${order}">[純愛]</a>
        <a href="/search?tag=バイノーラル&img=${imgMode}&lang=${langMode}&order=${order}">[バイノーラル]</a>
      </div>
    </div>

    ${popularHtml}
  `;

  return res.send(renderRetroPage('Home', content, '', imgMode, langMode, tagMode));
}

// Controller: Search Results Page
async function handleSearchRequest(req: Request, res: Response) {
  let query = (req.query.q as string) || '';
  const page = parseInt((req.query.page as string) || '1', 10) || 1;
  const imgMode = (req.query.img as string) || '1';
  const langMode = (req.query.lang as string) || 'all';
  const tagMode = (req.query.tag as string) || '';
  const order = (req.query.order as string) || 'release';
  const sort = (req.query.sort as string) || 'desc';

  let resultsHtml = '';
  let paginationHtml = '';

  try {
    const targetSearch = buildUpstreamSearchQuery(query, tagMode, langMode);

    const searchUrl = `https://api.asmr.one/api/search/${encodeURIComponent(targetSearch)}?page=${page}&order=${order}&sort=${sort}`;
    let upstreamRes = await fetch(searchUrl, { headers: ASMR_API_HEADERS });
    let works: any[] = [];
    let total = 0;
    let pageSize = 20;

    if (upstreamRes.ok) {
      const data = await upstreamRes.json();
      works = data.works || [];
      total = data.pagination?.totalCount || 0;
      pageSize = data.pagination?.pageSize || 20;
    }

    let filtered = langMode !== 'all' ? works.filter((w: any) => matchesLanguage(w, langMode)) : works;
    if (tagMode) filtered = filtered.filter((w: any) => matchesTag(w, tagMode));

    // If 0 results after filtering and language filter is active, try alternate language search keywords
    if (filtered.length === 0 && langMode !== 'all') {
      const altKeywords: Record<string, string[]> = {
        en: ['ENG', '英語', '$ENG', 'English'],
        'zh-hans': ['中文', '汉化', '简体', 'CHI_HANS'],
        'zh-hant': ['繁體', '繁体', 'CHI_HANT'],
        ko: ['한국어', '韓国語', 'KO_KR'],
        vi: ['tiếng việt', 'vietsub', 'vietnamese'],
      };
      const alts = altKeywords[langMode] || [];
      for (const alt of alts) {
        if (alt === targetSearch) continue;
        const altQuery = query ? `${query} ${alt}` : tagMode ? `${tagMode} ${alt}` : alt;
        const altUrl = `https://api.asmr.one/api/search/${encodeURIComponent(altQuery)}?page=${page}&order=${order}&sort=${sort}`;
        try {
          const altRes = await fetch(altUrl, { headers: ASMR_API_HEADERS });
          if (altRes.ok) {
            const altData = await altRes.json();
            let cand = (altData.works || []).filter((w: any) => matchesLanguage(w, langMode));
            if (tagMode) cand = cand.filter((w: any) => matchesTag(w, tagMode));
            if (cand.length > 0) {
              filtered = cand;
              total = altData.pagination?.totalCount || cand.length;
              break;
            }
          }
        } catch {}
      }
    }

    works = filtered;

    const totalPages = Math.ceil(total / pageSize) || 1;
    const orderLabel = order === 'release' ? 'Recent' : order === 'dl_count' ? 'Top Downloads' : order === 'rating' ? 'Rating' : 'New Added';

    resultsHtml += `
      <div style="font-size:11px; margin-bottom:8px; padding:4px 6px; background:#f1f5f9; border:1px solid #cbd5e1;">
        <strong>Sort:</strong> 
        ${order === 'release' ? '<strong style="color:#b91c1c;">[Recent]</strong>' : `<a href="/search?q=${encodeURIComponent(query)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=${langMode}&order=release">[Recent]</a>`} |
        ${order === 'dl_count' ? '<strong style="color:#b91c1c;">[Top DLs]</strong>' : `<a href="/search?q=${encodeURIComponent(query)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=${langMode}&order=dl_count">[Top DLs]</a>`} |
        ${order === 'rating' ? '<strong style="color:#b91c1c;">[Top Rated]</strong>' : `<a href="/search?q=${encodeURIComponent(query)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=${langMode}&order=rating">[Top Rated]</a>`} |
        ${order === 'create_date' ? '<strong style="color:#b91c1c;">[New Added]</strong>' : `<a href="/search?q=${encodeURIComponent(query)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=${langMode}&order=create_date">[New Added]</a>`}
      </div>

      <div style="font-size:12px; margin-bottom: 8px;">
        Results: <strong>${works.length}</strong> works (Sorted by: <strong>${orderLabel}</strong> &bull; Page ${page} of ${totalPages} &bull; Lang: ${escapeHtml(langMode.toUpperCase())})
        ${tagMode ? ` &bull; Tag: <strong style="color:#b91c1c;">#${escapeHtml(tagMode)}</strong> <a href="/search?q=${encodeURIComponent(query)}&img=${imgMode}&lang=${langMode}&order=${order}">[Clear]</a>` : ''}
      </div>
    `;

    if (works.length === 0) {
      resultsHtml += '<p>No matching works found.</p>';
    } else {
      for (const w of works) {
        const coverHtml =
          imgMode !== '0' && w.thumbnailCoverUrl
            ? `<div style="margin: 4px 0;"><img src="${escapeHtml(
                w.thumbnailCoverUrl
              )}" width="120" height="120" alt="Cover" style="border:1px solid #ccc;" /></div>`
            : '';

        const vaNames = (w.vas || []).map((v: any) => v.name).join(', ') || 'N/A';
        const langInfo = getWorkLanguageLabel(w);

        let editionsHtml = '';
        const edList = getLanguageEditions(w);
        if (edList.length > 0) {
          editionsHtml = `<div style="font-size:10px; margin-top:2px; color:#475569;">
            Editions: ${edList.map((ed: any) => `<a href="/work/${encodeURIComponent(ed.workno)}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[${escapeHtml(ed.label)}: ${escapeHtml(ed.workno)}]</a>`).join(' ')}
          </div>`;
        }

        const tagsHtml = (w.tags && w.tags.length > 0)
          ? `<div class="meta-tag" style="margin-top:2px;">Tags: ${w.tags.slice(0, 5).map((t: any) => `<a href="/search?tag=${encodeURIComponent(t.name)}&img=${imgMode}&lang=${langMode}&order=${order}" style="color:#0284c7; text-decoration:underline; margin-right:3px;">[#${escapeHtml(t.name)}]</a>`).join(' ')}</div>`
          : '';

        resultsHtml += `
          <div class="work-item">
            <span class="badge badge-rj">${escapeHtml(w.source_id || 'RJ' + w.id)}</span>
            <span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">${escapeHtml(langInfo.label)}</span>
            <span class="badge badge-rating">Rating: ${escapeHtml(String(w.rate_average_2dp || '0'))}</span>
            <div class="work-title">
              <a href="/work/${encodeURIComponent(w.source_id || w.id)}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">${escapeHtml(w.title)}</a>
            </div>
            ${coverHtml}
            <div class="meta-tag">
              Circle: <strong>${escapeHtml(w.name || 'N/A')}</strong> | CV: ${escapeHtml(vaNames)}<br />
              DLs: ${escapeHtml(String(w.dl_count || 0))} | Released: ${escapeHtml(w.release || 'N/A')}
            </div>
            ${tagsHtml}
            ${editionsHtml}
            <div style="margin-top: 5px;">
              <a href="/work/${encodeURIComponent(w.source_id || w.id)}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}" class="btn btn-sm">[View Tracks]</a>
              <a href="/api/download/playlist.m3u?id=${w.id}" class="btn btn-green btn-sm">[M3U Playlist]</a>
            </div>
          </div>
        `;
      }

      // Pagination links
      paginationHtml = '<div class="pagination">';
      if (page > 1) {
        paginationHtml += `<a href="/search?q=${encodeURIComponent(query)}&tag=${encodeURIComponent(tagMode)}&page=${page - 1}&img=${imgMode}&lang=${langMode}&order=${order}&sort=${sort}">&laquo; Previous Page</a> | `;
      }
      paginationHtml += `Page ${page} / ${totalPages}`;
      if (page < totalPages) {
        paginationHtml += ` | <a href="/search?q=${encodeURIComponent(query)}&tag=${encodeURIComponent(tagMode)}&page=${page + 1}&img=${imgMode}&lang=${langMode}&order=${order}&sort=${sort}">Next Page &raquo;</a>`;
      }
      paginationHtml += '</div>';
    }
  } catch (err: any) {
    resultsHtml = `<p style="color:red;">Error connecting to ASMR search service: ${escapeHtml(err.message)}</p>`;
  }

  const allSearchTags = [...CLASSIC_POPULAR_TAGS];
  if (tagMode && !allSearchTags.some((t) => t.id === tagMode || t.id.toLowerCase() === tagMode.toLowerCase())) {
    allSearchTags.unshift({ id: tagMode, label: `#${tagMode}` });
  }
  const tagSelectOptions = allSearchTags.map(
    (t) => `<option value="${escapeHtml(t.id)}" ${tagMode === t.id ? 'selected' : ''}>${escapeHtml(t.label)}</option>`
  ).join('');

  const content = `
    <div class="search-box">
      <form action="/search" method="GET">
        <input type="hidden" name="img" value="${escapeHtml(imgMode)}" />
        <input type="text" name="q" value="${escapeHtml(query)}" placeholder="RJ code or keywords..." style="margin-bottom:4px;" /><br />
        
        <label for="order"><strong>Sort:</strong></label>
        <select name="order" id="order" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="release" ${order === 'release' ? 'selected' : ''}>Recent</option>
          <option value="dl_count" ${order === 'dl_count' ? 'selected' : ''}>Top Downloads</option>
          <option value="rating" ${order === 'rating' ? 'selected' : ''}>Rating</option>
          <option value="create_date" ${order === 'create_date' ? 'selected' : ''}>New Added</option>
          <option value="review_count" ${order === 'review_count' ? 'selected' : ''}>Reviews</option>
        </select>

        <label for="lang"><strong>Lang:</strong></label>
        <select name="lang" id="lang" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="all" ${langMode === 'all' ? 'selected' : ''}>All Languages</option>
          <option value="ja" ${langMode === 'ja' ? 'selected' : ''}>Japanese (JP)</option>
          <option value="zh-hans" ${langMode === 'zh-hans' ? 'selected' : ''}>Simplified Chinese (CHI-S)</option>
          <option value="zh-hant" ${langMode === 'zh-hant' ? 'selected' : ''}>Traditional Chinese (CHI-T)</option>
          <option value="en" ${langMode === 'en' ? 'selected' : ''}>English (ENG)</option>
          <option value="vi" ${langMode === 'vi' ? 'selected' : ''}>Vietnamese (VIE)</option>
          <option value="ko" ${langMode === 'ko' ? 'selected' : ''}>Korean (KOR)</option>
        </select>

        <label for="tag"><strong>Tag:</strong></label>
        <select name="tag" id="tag" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="">All Tags</option>
          ${tagSelectOptions}
        </select>
        <input type="submit" value="Search" />
      </form>
    </div>
    ${resultsHtml}
    ${paginationHtml}
  `;

  return res.send(renderRetroPage(`Search: ${query || tagMode || (langMode !== 'all' ? langMode.toUpperCase() : 'Popular')}`, content, query, imgMode, langMode, tagMode));
}

// Controller: Work Details & Track List
async function handleWorkRequest(req: Request, res: Response) {
  const inputId = req.params.id;
  const imgMode = (req.query.img as string) || '1';
  const transMode = (req.query.trans as string) || '';
  const tagMode = (req.query.tag as string) || '';
  const langMode = (req.query.lang as string) || 'all';

  try {
    let resolved = await resolveNumericWorkId(inputId);
    let workRes: any = null;
    let tracksRes: any = null;

    if (resolved) {
      const [wR, tR] = await Promise.all([
        fetch(`https://api.asmr.one/api/work/${resolved.numericId}`, { headers: ASMR_API_HEADERS }),
        fetch(`https://api.asmr.one/api/tracks/${resolved.numericId}`, { headers: ASMR_API_HEADERS }),
      ]);
      workRes = wR;
      tracksRes = tR;
    }

    // Fallback: If tracks failed, try candidate formats
    if (!tracksRes || !tracksRes.ok) {
      const cleanDigits = inputId.replace(/[^0-9]/g, '');
      const candidates: string[] = [inputId];
      if (cleanDigits) {
        candidates.push(`RJ${cleanDigits}`);
        candidates.push(cleanDigits);
        candidates.push(cleanDigits.replace(/^0+/, ''));
        candidates.push(`0${cleanDigits}`);
      }

      for (const cand of candidates) {
        if (resolved && cand === resolved.numericId) continue;
        try {
          const [wR, tR] = await Promise.all([
            fetch(`https://api.asmr.one/api/work/${encodeURIComponent(cand)}`, { headers: ASMR_API_HEADERS }),
            fetch(`https://api.asmr.one/api/tracks/${encodeURIComponent(cand)}`, { headers: ASMR_API_HEADERS }),
          ]);
          if (tR.ok) {
            workRes = wR;
            tracksRes = tR;
            resolved = { numericId: cand, workMeta: wR.ok ? await wR.json().catch(() => null) : null };
            break;
          }
        } catch {
          // continue
        }
      }
    }

    const workData = workRes && workRes.ok ? await workRes.json() : resolved?.workMeta || null;
    let flattened: FlattenedTrack[] = [];

    if (tracksRes && tracksRes.ok) {
      const tracksData = await tracksRes.json();
      flattened = flattenTracks(tracksData);
    }

    if (!workData && flattened.length === 0) {
      return res.status(404).send(renderRetroPage('Not Found', `<p style="color:red;">Work ${escapeHtml(inputId)} not found on server.</p><p><a href="/search?q=${encodeURIComponent(inputId)}">&laquo; Search for ${escapeHtml(inputId)}</a></p>`, '', imgMode));
    }

    const audioTracks = flattened.filter((t) => t.type === 'audio');
    const textTracks = flattened.filter((t) => t.type === 'text');
    const totalSize = flattened.reduce((acc, t) => acc + (t.size || 0), 0);

    const actualId = resolved?.numericId || inputId;
    const rjCode = workData?.source_id || (inputId.toUpperCase().startsWith('RJ') ? inputId : `RJ${actualId}`);
    const rawTitle = (workData?.title || `Work ${actualId}`).trim();
    let displayTitle = rawTitle;
    let trackTranslations: Record<string, string> = {};
    let isFullyCached = false;
    let missingCount = 0;

    const textsToTranslate = [rawTitle, ...flattened.map((t) => (t.title || '').trim())].filter(Boolean);

    if (transMode === 'en' || transMode === 'vi') {
      try {
        const cacheCheck = getCachedTitlesBatch(textsToTranslate, transMode);
        trackTranslations = cacheCheck.cached;
        displayTitle = trackTranslations[rawTitle] || rawTitle;
        isFullyCached = cacheCheck.missing.length === 0;
        missingCount = cacheCheck.missing.length;
      } catch (tErr) {
        console.warn('SSR title cache query error:', tErr);
      }
    }

    const circleName = workData?.name || 'N/A';
    const vas = (workData?.vas || []).map((v: any) => v.name).join(', ') || 'N/A';

    const tagsHtml = (workData?.tags && workData.tags.length > 0)
      ? workData.tags.map((t: any) => `<a href="/search?tag=${encodeURIComponent(t.name)}&img=${imgMode}&lang=${langMode}${transMode ? `&trans=${transMode}` : ''}" class="btn btn-sm" style="margin:2px 3px 2px 0;">#${escapeHtml(t.name)}</a>`).join(' ')
      : 'None';

    const coverHtml =
      imgMode !== '0' && workData?.thumbnailCoverUrl
        ? `<div style="margin: 6px 0;"><img src="${escapeHtml(
            workData.thumbnailCoverUrl
          )}" width="160" height="160" alt="Cover" style="border:1px solid #94a3b8;" /></div>`
        : '';

    let tracksTableHtml = '';
    if (flattened.length === 0) {
      tracksTableHtml = `<div style="padding:8px; background:#fef2f2; border:1px solid #fecaca; color:#991b1b; font-size:11px; margin:8px 0;">
        <strong>Notice:</strong> Tracks for this work are currently not available in the audio repository.
      </div>`;
    } else {
      tracksTableHtml = `
        <table class="track-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Track Name</th>
              <th>Size</th>
              <th>Duration</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
      `;

      for (const track of flattened) {
        const url = track.mediaDownloadUrl || track.mediaStreamUrl;
        const directDownloadUrl = url || '#';

        const trimmedTrackTitle = (track.title || '').trim();
        const translatedTrackName = trackTranslations[trimmedTrackTitle] || trackTranslations[track.title];

        let typeBadge = `<span class="badge">${escapeHtml(track.type.toUpperCase())}</span>`;
        let actionsHtml = '';

        if (track.type === 'audio' && url) {
          typeBadge = `<span class="badge" style="background:#dbeafe; color:#1e40af;">AUDIO</span>`;
          actionsHtml = `<a href="${escapeHtml(directDownloadUrl)}" target="_blank" rel="noopener noreferrer" download="${escapeHtml(track.title)}" class="btn btn-sm btn-green">[Download]</a>`;
        } else if (track.type === 'text' && url) {
          typeBadge = `<span class="badge" style="background:#fef3c7; color:#92400e;">TXT</span>`;
          actionsHtml = `
            <a href="/text/${actualId}/${encodeURIComponent(track.hash || '')}?url=${encodeURIComponent(
            url
          )}&img=${imgMode}" class="btn btn-sm">[Read Script]</a>
            <a href="${escapeHtml(directDownloadUrl)}" target="_blank" rel="noopener noreferrer" download="${escapeHtml(track.title)}" class="btn btn-sm btn-green">[Download]</a>
          `;
        } else if (url) {
          actionsHtml = `<a href="${escapeHtml(directDownloadUrl)}" target="_blank" rel="noopener noreferrer" download="${escapeHtml(track.title)}" class="btn btn-sm btn-green">[Download]</a>`;
        }

        tracksTableHtml += `
          <tr>
            <td>${typeBadge}</td>
            <td class="track-name-cell" data-raw-title="${escapeHtml(track.title)}">
              <strong>${escapeHtml(translatedTrackName || track.title)}</strong>
              ${translatedTrackName && translatedTrackName !== track.title ? `<br /><span class="orig-subtitle" style="font-size:10px; color:#64748b;">Orig: ${escapeHtml(track.title)}</span>` : ''}
              <br /><span style="font-size:10px; color:#64748b;">${escapeHtml(track.path)}</span>
            </td>
            <td>${escapeHtml(formatBytes(track.size))}</td>
            <td>${escapeHtml(formatDuration(track.duration))}</td>
            <td>${actionsHtml}</td>
          </tr>
        `;
      }

      tracksTableHtml += `
          </tbody>
        </table>
      `;
    }

    const langInfo = getWorkLanguageLabel(workData || {});
    let editionsHtml = '';
    const edList = getLanguageEditions(workData);
    if (edList.length > 0) {
      editionsHtml = `<div style="margin-top: 4px; padding: 4px 6px; background:#f8fafc; border: 1px solid #cbd5e1; font-size:11px;">
        <strong>Language Editions:</strong>
        ${edList
          .map(
            (ed: any) =>
              `<a href="/work/${encodeURIComponent(ed.workno)}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}${transMode ? `&trans=${transMode}` : ''}">[${escapeHtml(ed.label)}: ${escapeHtml(ed.workno)}]</a>`
          )
          .join(' ')}
      </div>`;
    }

    const transSwitcherHtml = `
      <div style="margin: 6px 0; padding: 5px 8px; background: #eef2ff; border: 1px solid #c7d2fe; font-size: 11px;">
        <strong>Title Translation:</strong>
        ${!transMode ? '<strong>[Original JP]</strong>' : `<a href="/work/${encodeURIComponent(inputId)}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[Original JP]</a>`} |
        ${transMode === 'en' ? '<strong>[Translate to EN]</strong>' : `<a href="/work/${encodeURIComponent(inputId)}?trans=en&img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[Translate to EN]</a>`} |
        ${transMode === 'vi' ? '<strong>[Translate to VI]</strong>' : `<a href="/work/${encodeURIComponent(inputId)}?trans=vi&img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[Translate to VI]</a>`}
      </div>
    `;

    // Prompt banner when user requests translation and it's not yet cached
    let geminiPromptHtml = '';
    if ((transMode === 'en' || transMode === 'vi') && !isFullyCached) {
      geminiPromptHtml = `
        <div id="gemini-prompt-box" style="margin: 6px 0; padding: 8px 10px; background: #fefce8; border: 1px solid #eab308; font-size: 11px; color: #854d0e;">
          <div style="font-weight:bold; margin-bottom: 3px;">
            Google Gemini API Key Required for Title &amp; Track Translation
          </div>
          <div id="gemini-status-text" style="color: #713f12; margin-bottom: 6px;">
            ${missingCount} item(s) will be translated directly in your browser using your Gemini API key and uploaded to the server cache.
          </div>
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
            <button type="button" id="btn-run-gemini" class="btn btn-sm btn-green" onclick="window.runClientGeminiTranslation('${escapeHtml(transMode)}')">[Enter Gemini API Key &amp; Translate]</button>
            <button type="button" id="btn-change-gemini" class="btn btn-sm" onclick="window.promptSetGeminiKey()">[Change Key]</button>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" style="font-size:10px; color:#0284c7; text-decoration:underline;">[Get Free Gemini API Key]</a>
          </div>
        </div>
      `;
    }

    // Client-side script for executing Gemini translation and uploading to server cache & permanent vault
    const clientScriptHtml = (transMode === 'en' || transMode === 'vi') ? `
      <script type="text/javascript">
        window.__transTexts = ${JSON.stringify(textsToTranslate)};
        window.__rawTitle = ${JSON.stringify(rawTitle)};
        window.__pendingTransMode = ${JSON.stringify(transMode)};
        window.__needsAutoTranslate = ${JSON.stringify(!isFullyCached)};
        window.__workInfo = ${JSON.stringify({
          id: actualId,
          rjCode: rjCode,
          originalTitle: rawTitle,
          coverUrl: workData?.thumbnailCoverUrl || workData?.mainCoverUrl || '',
          circle: circleName,
          vas: vas,
          totalTracks: flattened.length,
        })};
      </script>
      <script type="text/javascript" src="/client-translator.js"></script>
    ` : '';

    const content = `
      <div style="margin-bottom: 10px;">
        <span class="badge badge-rj">${escapeHtml(rjCode)}</span>
        <span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">${escapeHtml(langInfo.label)}</span>
        ${transMode ? `<span class="badge" style="background:#dbeafe; color:#1e40af; font-weight:bold;">${escapeHtml(transMode === 'vi' ? 'VI Translated' : 'EN Translated')}</span>` : ''}
        <span class="badge badge-rating">Rating: ${escapeHtml(String(workData?.rate_average_2dp || 'N/A'))}</span>
        <h2 id="work-title-heading" style="font-size: 15px; margin: 4px 0;">${escapeHtml(displayTitle)}</h2>
        ${transMode && displayTitle !== rawTitle ? `<div id="work-title-orig" style="font-size:11px; color:#64748b; margin-bottom:4px;">Original: ${escapeHtml(rawTitle)}</div>` : ''}
        ${transSwitcherHtml}
        ${geminiPromptHtml}
        ${coverHtml}
        <div class="meta-tag">
          <strong>Language:</strong> ${escapeHtml(langInfo.label)} | <strong>Circle:</strong> ${escapeHtml(circleName)} | <strong>CV:</strong> ${escapeHtml(vas)}<br />
          <strong>Release:</strong> ${escapeHtml(workData?.release || 'N/A')} | <strong>Price:</strong> &yen;${escapeHtml(
      String(workData?.price || 0)
    )}<br />
          <strong>Total Size:</strong> ${escapeHtml(formatBytes(totalSize))} | <strong>Tracks:</strong> ${audioTracks.length} audio, ${textTracks.length} text<br />
          <strong>Tags:</strong> ${tagsHtml}
        </div>
        ${editionsHtml}
      </div>

      ${flattened.length > 0 ? `
      <div style="margin: 6px 0;">
        <a href="/api/download/playlist.m3u?id=${actualId}" class="btn btn-green">[RealPlayer M3U]</a>
        <a href="/api/download/batch-links.txt?id=${actualId}" class="btn">[Links TXT]</a>
        <a href="/api/download/batch-script.sh?id=${actualId}" class="btn">[Script SH]</a>
        <a href="/api/download/zip/${actualId}" class="btn btn-amber">[ZIP Archive]</a>
      </div>
      ` : ''}

      <h3>Tracks (${flattened.length})</h3>
      ${tracksTableHtml}
      <div style="margin-top: 10px;">
        <a href="/search?q=${encodeURIComponent(circleName)}&img=${imgMode}">&laquo; More from Circle: ${escapeHtml(circleName)}</a>
      </div>
      ${clientScriptHtml}
    `;

    return res.send(renderRetroPage(displayTitle, content, rjCode, imgMode, langMode, tagMode));
  } catch (err: any) {
    console.error('Work view error:', err);
    return res.status(500).send(renderRetroPage('Error', `<p style="color:red;">Error loading work: ${escapeHtml(err.message)}</p>`, '', imgMode));
  }
}

// Controller: Script & Subtitle Reader with Multi-Language AI Translation
async function handleTextRequest(req: Request, res: Response) {
  const workId = req.params.workId;
  const targetUrl = req.query.url as string;
  const imgMode = (req.query.img as string) || '1';
  const targetLang = (req.query.targetLang as string) || 'orig';
  const mode = (req.query.mode as any) || (targetLang !== 'orig' ? 'translated' : 'orig');
  const tone = (req.query.tone as any) || 'asmr';

  if (!targetUrl) {
    return res.status(400).send('Missing script URL');
  }

  try {
    const upstreamRes = await fetch(targetUrl, { headers: ASMR_API_HEADERS });
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send('Failed to fetch script text');
    }
    const rawTextContent = await upstreamRes.text();

    const scriptHash = String(req.params.hash || 'script').trim();
    const cleanMode = mode === 'bilingual' ? 'bilingual' : 'translated';
    const cacheKey = getScriptCacheKey(scriptHash || rawTextContent, { targetLang, mode: cleanMode });

    let displayContent = rawTextContent;
    let translationMetaHtml = '';
    let isTranslated = false;
    let clientScriptHtml = '';

    const langLabels: Record<string, string> = {
      en: 'English (ENG)',
      vi: 'Vietnamese (VIE)',
      'zh-hans': 'Simplified Chinese (CHI-S)',
      'zh-hant': 'Traditional Chinese (CHI-T)',
      ko: 'Korean (KOR)',
      ja: 'Japanese (JPN)',
      es: 'Spanish (ESP)',
      fr: 'French (FRA)',
      de: 'German (DEU)',
      ru: 'Russian (RUS)',
      id: 'Indonesian (IDN)',
      th: 'Thai (THA)',
    };

    const activeLangLabel = langLabels[targetLang] || targetLang.toUpperCase();
    const modeLabel = cleanMode === 'bilingual' ? 'Bilingual Interleaved' : 'Translated Only';

    if (targetLang && targetLang !== 'orig') {
      // 1. Check if already translated in server cache (Smart Skip!)
      const cachedRecord = getCachedScriptTranslation(cacheKey);

      if (cachedRecord && cachedRecord.translatedText) {
        displayContent = cachedRecord.translatedText;
        isTranslated = true;

        translationMetaHtml = `
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:8px; margin-bottom:10px; font-size:11px; color:#166534;">
            <strong>✓ Translated with Gemini Flash Lite AI</strong> &bull; <strong>Language:</strong> ${escapeHtml(activeLangLabel)} &bull; <strong>Mode:</strong> ${escapeHtml(modeLabel)}<br />
            <strong>Status:</strong> Loaded from permanent server cache (Skipped translation, 0 API calls used) &bull; <strong>Characters:</strong> ${(cachedRecord.charCount || cachedRecord.translatedText.length).toLocaleString()}<br />
            <div style="margin-top:6px;">
              <a href="/api/download/translated-script?url=${encodeURIComponent(targetUrl)}&targetLang=${encodeURIComponent(targetLang)}&mode=${encodeURIComponent(cleanMode)}&name=script_${workId}.txt" class="btn btn-sm btn-green">[Download Translated TXT]</a>
              <a href="/text/${workId}/${encodeURIComponent(req.params.hash)}?url=${encodeURIComponent(targetUrl)}&img=${imgMode}&targetLang=orig" class="btn btn-sm">[View Original Text]</a>
            </div>
          </div>
        `;
      } else {
        // Not yet translated in cache: provide client-side AI translator box
        translationMetaHtml = `
          <div id="gemini-script-box" style="margin: 6px 0 10px 0; padding: 8px 10px; background: #fefce8; border: 1px solid #eab308; font-size: 11px; color: #854d0e;">
            <div id="gemini-script-status" style="color: #713f12; margin-bottom: 6px;">
              This script has not been translated to <strong>${escapeHtml(activeLangLabel)}</strong> yet. Translate client-side with Google Gemini (Flash Lite) and save permanently to server cache!
            </div>
            <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
              <button type="button" id="btn-run-script-gemini" class="btn btn-sm btn-green" onclick="window.runClientGeminiScriptTranslation()">[Translate Script with Gemini AI (Flash Lite)]</button>
              <button type="button" id="btn-change-script-gemini" class="btn btn-sm" onclick="window.promptSetGeminiKey()">[Change Key]</button>
              <a href="/api/download/translated-script?url=${encodeURIComponent(targetUrl)}&targetLang=${encodeURIComponent(targetLang)}&mode=${encodeURIComponent(cleanMode)}&name=script_${workId}.txt" id="btn-download-translated-script" class="btn btn-sm btn-green" style="display:none;">[Download Translated TXT]</a>
              <a href="/text/${workId}/${encodeURIComponent(req.params.hash)}?url=${encodeURIComponent(targetUrl)}&img=${imgMode}&targetLang=orig" class="btn btn-sm">[View Original Text]</a>
            </div>
          </div>
        `;

        clientScriptHtml = `
          <script type="text/javascript">
            window.__scriptData = {
              workId: ${JSON.stringify(workId)},
              hash: ${JSON.stringify(scriptHash)},
              targetUrl: ${JSON.stringify(targetUrl)},
              targetLang: ${JSON.stringify(targetLang)},
              mode: ${JSON.stringify(cleanMode)},
              cacheKey: ${JSON.stringify(cacheKey)},
              rawText: ${JSON.stringify(rawTextContent)}
            };
            window.__needsAutoTranslateScript = true;
          </script>
          <script type="text/javascript" src="/client-translator.js"></script>
        `;
      }
    }

    const downloadOriginalUrl = `/api/download/file?url=${encodeURIComponent(targetUrl)}&name=script_${workId}_orig.txt`;

    const content = `
      <div style="margin-bottom: 8px;">
        <a href="/work/${workId}?img=${imgMode}" class="btn btn-sm">&laquo; Back to Work Details</a>
        <a href="${downloadOriginalUrl}" class="btn btn-sm btn-green" style="margin-left:4px;">[Download Original TXT]</a>
      </div>

      <div class="search-box" style="background:#f1f5f9; border-color:#cbd5e1; margin-bottom:10px;">
        <strong>Script Translation:</strong>
        <form action="/text/${workId}/${encodeURIComponent(req.params.hash)}" method="GET" style="margin-top:6px;">
          <input type="hidden" name="url" value="${escapeHtml(targetUrl)}" />
          <input type="hidden" name="img" value="${escapeHtml(imgMode)}" />
          
          <label for="targetLang"><strong>Target:</strong></label>
          <select name="targetLang" id="targetLang" style="font-size:11px; padding:2px; margin-right:4px;">
            <option value="orig" ${targetLang === 'orig' ? 'selected' : ''}>Original</option>
            <option value="en" ${targetLang === 'en' ? 'selected' : ''}>English (ENG)</option>
            <option value="vi" ${targetLang === 'vi' ? 'selected' : ''}>Vietnamese (VIE)</option>
            <option value="zh-hans" ${targetLang === 'zh-hans' ? 'selected' : ''}>Simplified Chinese (CHI-S)</option>
            <option value="zh-hant" ${targetLang === 'zh-hant' ? 'selected' : ''}>Traditional Chinese (CHI-T)</option>
            <option value="ko" ${targetLang === 'ko' ? 'selected' : ''}>Korean (KOR)</option>
            <option value="ja" ${targetLang === 'ja' ? 'selected' : ''}>Japanese (JPN)</option>
            <option value="es" ${targetLang === 'es' ? 'selected' : ''}>Spanish (ESP)</option>
            <option value="fr" ${targetLang === 'fr' ? 'selected' : ''}>French (FRA)</option>
            <option value="de" ${targetLang === 'de' ? 'selected' : ''}>German (DEU)</option>
            <option value="ru" ${targetLang === 'ru' ? 'selected' : ''}>Russian (RUS)</option>
            <option value="id" ${targetLang === 'id' ? 'selected' : ''}>Indonesian (IDN)</option>
            <option value="th" ${targetLang === 'th' ? 'selected' : ''}>Thai (THA)</option>
          </select>

          <label for="mode"><strong>Mode:</strong></label>
          <select name="mode" id="mode" style="font-size:11px; padding:2px; margin-right:4px;">
            <option value="translated" ${cleanMode === 'translated' ? 'selected' : ''}>Translated Only</option>
            <option value="bilingual" ${cleanMode === 'bilingual' ? 'selected' : ''}>Bilingual Interleaved</option>
            <option value="orig" ${targetLang === 'orig' ? 'selected' : ''}>Original Only</option>
          </select>

          <input type="submit" value="Translate" class="btn btn-sm" />
        </form>
      </div>

      ${translationMetaHtml}

      <h3>${isTranslated ? 'Translated Script' : 'Original Script'}</h3>
      <div id="script-content-display" style="background:#ffffff; border:1px solid #cbd5e1; padding:10px; font-family:monospace; font-size:12px; white-space:pre-wrap; word-wrap:break-word; max-height:650px; overflow-y:auto; line-height:1.5; color:#0f172a;">
${escapeHtml(displayContent)}
      </div>
      <div style="margin-top: 8px;">
        <a href="/work/${workId}?img=${imgMode}" class="btn btn-sm">&laquo; Back to Work Details</a>
      </div>
      ${clientScriptHtml}
    `;

    return res.send(renderRetroPage(isTranslated ? `Script (${targetLang.toUpperCase()})` : 'Script Viewer', content, '', imgMode));
  } catch (err: any) {
    return res.status(500).send('Error reading or translating script text');
  }
}

// Controller: Permanent Translated Works Vault Page (SSR / Classic)
async function handleTranslatedPageRequest(req: Request, res: Response) {
  const imgMode = (req.query.img as string) || '1';
  const langMode = (req.query.lang as string) || 'all';
  const searchQuery = (req.query.q as string) || '';

  const cleanLang = langMode === 'en' || langMode === 'vi' ? langMode : 'all';
  const translatedWorks = getPermanentTranslatedWorks(cleanLang, searchQuery);
  const stats = getPermanentTranslationStats();

  let worksHtml = '';
  if (translatedWorks.length === 0) {
    worksHtml = `
      <div class="info-box" style="padding:12px; margin:10px 0; background:#f8fafc; border:1px solid #cbd5e1;">
        <strong>No translated works found ${searchQuery ? `matching "${escapeHtml(searchQuery)}"` : 'in the vault yet'}.</strong>
        <p style="margin:6px 0 0 0; color:#475569; font-size:11px;">
          When any user translates titles and tracks with Google Gemini (client-side), the translated work is permanently saved into this server vault and displayed here for everyone to browse!
        </p>
        <p style="margin:6px 0 0 0;">
          <a href="/?img=${imgMode}&lang=${langMode}" class="btn btn-sm">&laquo; Browse Works to Translate</a>
        </p>
      </div>
    `;
  } else {
    for (const w of translatedWorks) {
      const coverHtml = imgMode !== '0' && w.coverUrl
        ? `<div style="margin: 4px 0;"><img src="${escapeHtml(w.coverUrl)}" width="120" height="120" alt="Cover" style="border:1px solid #cbd5e1;" /></div>`
        : '';

      const enTitle = w.translatedTitle?.en;
      const viTitle = w.translatedTitle?.vi;
      let displayTitle = enTitle || viTitle || w.originalTitle;
      if (cleanLang === 'vi' && viTitle) displayTitle = viTitle;
      if (cleanLang === 'en' && enTitle) displayTitle = enTitle;

      const trackInfo = w.totalTracksCount ? `${w.translatedTracksCount}/${w.totalTracksCount} tracks translated` : `${w.translatedTracksCount} tracks translated`;
      const dateFormatted = w.translatedAt ? new Date(w.translatedAt).toLocaleDateString() : '';

      worksHtml += `
        <div class="work-item">
          <span class="badge badge-rj">${escapeHtml(w.rjCode)}</span>
          ${enTitle ? '<span class="badge" style="background:#dbeafe; color:#1e40af; font-weight:bold;">🇬🇧 EN</span>' : ''}
          ${viTitle ? '<span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">🇻🇳 VI</span>' : ''}
          <span class="badge" style="background:#f0fdf4; color:#166534; font-weight:bold;">✓ ${escapeHtml(trackInfo)}</span>
          <div class="work-title">
            <a href="/work/${encodeURIComponent(w.rjCode || String(w.id))}?trans=${cleanLang !== 'all' ? cleanLang : 'en'}&img=${imgMode}">${escapeHtml(displayTitle)}</a>
          </div>
          ${w.originalTitle && displayTitle !== w.originalTitle ? `<div style="font-size:11px; color:#64748b; margin-bottom:3px;">Orig: ${escapeHtml(w.originalTitle)}</div>` : ''}
          ${coverHtml}
          <div class="meta-tag">
            Circle: <strong>${escapeHtml(w.circle || 'N/A')}</strong> | CV: ${escapeHtml(w.vas || 'N/A')}<br />
            Permanent Vault Entry: ${escapeHtml(dateFormatted)}
          </div>
          <div style="margin-top: 4px;">
            <a href="/work/${encodeURIComponent(w.rjCode || String(w.id))}?trans=${cleanLang !== 'all' ? cleanLang : 'en'}&img=${imgMode}" class="btn btn-sm">[View Tracks]</a>
            <a href="/api/download/playlist.m3u?id=${encodeURIComponent(String(w.id || w.rjCode))}" class="btn btn-green btn-sm">[M3U Playlist]</a>
          </div>
        </div>
      `;
    }
  }

  const content = `
    <div style="margin-bottom: 8px; padding: 8px 10px; background: #e0f2fe; border: 1px solid #7dd3fc; font-size: 11px; color: #0369a1;">
      <strong>Permanent Translated Works Vault</strong> &bull; Total Works: <strong>${stats.totalWorks}</strong> (EN: <strong>${stats.enWorksCount}</strong>, VI: <strong>${stats.viWorksCount}</strong>, Cached Titles: <strong>${stats.totalTitlesCached}</strong>)
      <br /><span style="font-size:10px; color:#0c4a6e;">All works listed here have their titles and tracks permanently stored in the server vault. Translated client-side via Gemini API.</span>
    </div>

    <div class="search-box">
      <form action="/translated" method="GET">
        <input type="hidden" name="img" value="${escapeHtml(imgMode)}" />
        <input type="text" name="q" placeholder="Search translated works..." value="${escapeHtml(searchQuery)}" style="margin-bottom:4px;" /><br />
        <label for="lang"><strong>Filter Language:</strong></label>
        <select name="lang" id="lang" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="all" ${cleanLang === 'all' ? 'selected' : ''}>All Translated Works (${stats.totalWorks})</option>
          <option value="en" ${cleanLang === 'en' ? 'selected' : ''}>English Translations (${stats.enWorksCount})</option>
          <option value="vi" ${cleanLang === 'vi' ? 'selected' : ''}>Vietnamese Translations (${stats.viWorksCount})</option>
        </select>
        <input type="submit" value="Filter Vault" />
        ${searchQuery ? `<a href="/translated?lang=${cleanLang}&img=${imgMode}" style="font-size:11px; margin-left:6px;">[Clear Search]</a>` : ''}
      </form>
    </div>

    ${worksHtml}
  `;

  return res.send(renderRetroPage('Translated Works Vault', content, '', imgMode, langMode));
}

// ============================================================================
// MAIN APPLICATION ROUTES (Serving Legacy Retro UI Exclusively for All Users)
// ============================================================================
app.get('/', handleHomeRequest);
app.get('/search', handleSearchRequest);
app.get('/work/:id', handleWorkRequest);
app.get('/text/:workId/:hash', handleTextRequest);
app.get('/translated', handleTranslatedPageRequest);

// Backward Compatibility Aliases for /classic
app.get('/classic', handleHomeRequest);
app.get('/classic/search', handleSearchRequest);
app.get('/classic/work/:id', handleWorkRequest);
app.get('/classic/text/:workId/:hash', handleTextRequest);
app.get('/classic/translated', handleTranslatedPageRequest);

// ==========================================
// VITE DEV SERVER OR PRODUCTION STATIC FILES
// ==========================================

async function startServer() {
  // Sync translation vault from Firestore database
  try {
    await initFirestoreVaultSync();
  } catch (fsErr) {
    console.warn('Firestore initial sync error:', fsErr);
  }

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`RetroASMR Engine running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
