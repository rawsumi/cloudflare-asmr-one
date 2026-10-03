import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import { translateScript } from './src/services/translator';

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

// Helper: Resolve work ID from query or RJ code (e.g. RJ01632573 -> 1632573)
async function resolveNumericWorkId(input: string): Promise<{ numericId: string; workMeta?: any } | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // If purely digits, return directly
  if (/^\d+$/.test(trimmed)) {
    return { numericId: trimmed };
  }

  // If starts with RJ, VJ, BJ
  const match = trimmed.match(/^(?:RJ|VJ|BJ)?0*(\d+)$/i);
  if (match && match[1]) {
    return { numericId: match[1] };
  }

  // Otherwise, search via API
  try {
    const searchUrl = `https://api.asmr.one/api/search/${encodeURIComponent(trimmed)}?page=1`;
    const res = await fetch(searchUrl, { headers: ASMR_API_HEADERS });
    if (res.ok) {
      const data = await res.json();
      if (data.works && data.works.length > 0) {
        return {
          numericId: String(data.works[0].id),
          workMeta: data.works[0],
        };
      }
    }
  } catch (err) {
    console.error('Error resolving work ID via search:', err);
  }

  return null;
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

const CLASSIC_POPULAR_TAGS = [
  // --- SFW: Triggers & Audio ---
  { id: '耳かき', label: '👂 耳かき / Ear Clean [SFW]' },
  { id: '囁き', label: '🤫 囁き / Whisper [SFW]' },
  { id: '吐息', label: '💨 吐息 / Breathing [SFW]' },
  { id: 'マッサージ', label: '💆‍♀️ マッサージ / Massage [SFW]' },
  { id: 'オイルマッサージ', label: '🧴 オイルマッサージ / Oil Massage [SFW]' },
  { id: 'ヘッドスパ', label: '💆 ヘッドスパ / Head Spa [SFW]' },
  { id: 'シャンプー', label: '🫧 シャンプー / Shampoo [SFW]' },
  { id: '心音', label: '💓 心音 / Heartbeat [SFW]' },
  { id: 'オノマトペ', label: '🔔 オノマトペ / Sound FX [SFW]' },
  { id: '耳ふー', label: '🌬️ 耳ふー / Ear Blowing [SFW]' },
  { id: 'タッピング', label: '🖐️ タッピング / Tapping [SFW]' },
  { id: '咀嚼音', label: '🍎 咀嚼音 / Chewing [SFW]' },
  { id: '泡・炭酸', label: '🛁 泡・炭酸 / Bubbles [SFW]' },
  { id: '雨音', label: '🌧️ 雨音 / Rain Sounds [SFW]' },
  { id: '水音', label: '💧 水音 / Water Ambience [SFW]' },
  { id: '焚き火', label: '🔥 焚き火 / Campfire [SFW]' },
  { id: '梵天', label: '🪶 梵天 / Fluffy Earpick [SFW]' },
  { id: '綿棒', label: '🥢 綿棒 / Cotton Swab [SFW]' },
  { id: '竹耳かき', label: '🎋 竹耳かき / Bamboo Earpick [SFW]' },
  { id: '粘着綿棒', label: '🩹 粘着綿棒 / Adhesive Swab [SFW]' },
  { id: 'スライム', label: '🧪 スライム / Slime [SFW]' },
  { id: 'ブラッシング', label: '🪮 ブラッシング / Hair Brushing [SFW]' },
  { id: '歯磨き', label: '🪥 歯磨き / Teeth Brushing [SFW]' },

  // --- SFW: Mood & Scenarios ---
  { id: '安眠', label: '💤 安眠 / Sleep Aid [SFW]' },
  { id: '純愛', label: '💖 純愛 / Pure Love [SFW]' },
  { id: '甘々', label: '🍯 甘々 / Pampering [SFW]' },
  { id: '添い寝', label: '🛏️ 添い寝 / Co-sleeping [SFW]' },
  { id: '癒やし', label: '🌿 癒やし / Healing [SFW]' },
  { id: 'お風呂', label: '♨️ お風呂 / Bath & Onsen [SFW]' },
  { id: '看病', label: '🩹 看病 / Caregiving [SFW]' },
  { id: '同棲', label: '🏠 同棲 / Living Together [SFW]' },
  { id: '告白', label: '💌 告白 / Confession [SFW]' },
  { id: '膝枕', label: '🦵 膝枕 / Lap Pillow [SFW]' },
  { id: '抱擁', label: '🫂 抱擁 / Hugging [SFW]' },
  { id: '朗読', label: '📚 朗読 / Reading [SFW]' },
  { id: '作業用BGM', label: '💻 作業用BGM / Study BGM [SFW]' },
  { id: 'カウンセリング', label: '🛋️ カウンセリング / Counseling [SFW]' },

  // --- Characters ---
  { id: 'お姉さん', label: '👩 お姉さん / Onee-san' },
  { id: '妹', label: '👧 妹 / Sister' },
  { id: '幼馴染', label: '🌸 幼馴染 / Friend' },
  { id: '後輩', label: '🎀 後輩 / Kouhai' },
  { id: '先輩', label: '💼 先輩 / Senpai' },
  { id: '同級生', label: '🏫 同級生 / Classmate' },
  { id: 'ツンデレ', label: '😾 ツンデレ / Tsundere' },
  { id: 'クーデレ', label: '🧊 クーデレ / Kuudere' },
  { id: 'ヤンデレ', label: '🔪 ヤンデレ / Yandere' },
  { id: '母性', label: '🤱 母性・ママ / Mommy' },
  { id: 'メイド', label: '🧹 メイド / Maid' },
  { id: 'ギャル', label: '💅 ギャル / Gyaru' },
  { id: '女子校生', label: '🎒 女子校生 / JK' },
  { id: '看護師', label: '💉 看護師 / Nurse' },
  { id: '女教師', label: '👩‍🏫 女教師 / Teacher' },
  { id: '女上司', label: '👠 女上司 / Female Boss' },
  { id: 'お嬢様', label: '👑 お嬢様 / Ojousama' },
  { id: 'ケモミミ', label: '🐾 ケモミミ / Animal Ears' },
  { id: '猫耳', label: '🐱 猫耳 / Catgirl' },
  { id: '人妻', label: '💍 人妻 / Married Woman' },
  { id: 'ボクっ娘', label: '🧢 ボクっ娘 / Tomboy' },
  { id: 'VTuber', label: '🎙️ VTuber / Streamer' },

  // --- Audio Tech ---
  { id: 'バイノーラル', label: '🎙️ バイノーラル / Binaural' },
  { id: 'KU100', label: '🎧 KU100' },
  { id: '3Dio', label: '🎛️ 3Dio FreeSpace' },
  { id: 'ダミーヘッド', label: '🗣️ ダミーヘッド / Dummy Head' },
  { id: 'ハイレゾ', label: '🎼 ハイレゾ / Hi-Res' },
  { id: '立体音響', label: '🔊 立体音響 / 3D Audio' },

  // --- NSFW (R18 / Adult) Triggers & Actions ---
  { id: '耳舐め', label: '👅 耳舐め / Ear Licking [18+]' },
  { id: '耳奥', label: '👂 耳奥 / Deep Ear [18+]' },
  { id: 'キス', label: '💋 キス・リップ音 / Kiss [18+]' },
  { id: 'オナサポート', label: '🔥 オナサポート / Guided [18+]' },
  { id: '淫語', label: '💋 淫語 / Dirty Talk [18+]' },
  { id: '喘ぎ声', label: '😮‍💨 喘ぎ声 / Moaning [18+]' },
  { id: '言葉責め', label: '😈 言葉責め / Verbal Tease [18+]' },
  { id: 'フェラ', label: '👄 フェラ / Oral Sounds [18+]' },
  { id: '手コキ', label: '🧴 手コキ / Handjob [18+]' },
  { id: 'パイズリ', label: '🍈 パイズリ / Titjob [18+]' },
  { id: '足コキ', label: '🦶 足コキ / Footjob [18+]' },
  { id: '焦らし', label: '⏳ 焦らし / Edging [18+]' },
  { id: '射精管理', label: '🔒 射精管理 / Orgasm Control [18+]' },
  { id: '搾精', label: '🥛 搾精 / Milking [18+]' },
  { id: '中出し', label: '💥 中出し / Creampie [18+]' },
  { id: '生ハメ', label: '⚡ 生ハメ / Raw Sex [18+]' },
  { id: '密着', label: '🫂 密着 / Body Contact [18+]' },
  { id: '催眠', label: '🌀 催眠 / Hypnosis [18+]' },
  { id: '潮吹き', label: '💦 潮吹き / Squirting [18+]' },
  { id: '玩具', label: '🍆 玩具・ローター / Toys [18+]' },

  // --- NSFW (R18 / Adult) Tropes & Fetishes ---
  { id: '甘サド', label: '👑 甘サド / Sweet Sadism [18+]' },
  { id: 'ドS', label: '⛓️ ドS / Dominant [18+]' },
  { id: 'ドM', label: '🧎 ドM / Masochist [18+]' },
  { id: 'メスガキ', label: '💢 メスガキ / Brat [18+]' },
  { id: '痴女', label: '👠 痴女 / Lewd [18+]' },
  { id: 'サキュバス', label: '💜 サキュバス / Succubus [18+]' },
  { id: '巨乳', label: '🍈 巨乳 / Big Breasts [18+]' },
  { id: '貧乳', label: '🍒 貧乳 / Flat Chest [18+]' },
  { id: '尻', label: '🍑 尻 / Butt Play [18+]' },
  { id: 'アナル', label: '🍩 アナル / Anal [18+]' },
  { id: '寝取られ', label: '💔 寝取られ / NTR [18+]' },
  { id: '寝取り', label: '🖤 寝取り / NTS [18+]' },
  { id: 'ハーレム', label: '👯‍♀️ ハーレム / Harem [18+]' },
  { id: '逆3P', label: '👭 逆3P / Threesome [18+]' },
  { id: '近親相姦', label: '🩸 近親相姦 / Incest [18+]' },
  { id: '百合', label: '🌸 百合 / Yuri [18+]' },
  { id: '主従', label: '🧎‍♀️ 主従 / Master & Servant [18+]' },
  { id: '調教', label: '🐕 調教 / Training [18+]' },
  { id: '拘束', label: '🪢 拘束 / Bondage [18+]' },
  { id: '触手', label: '🐙 触手 / Tentacles [18+]' },
  { id: '睡眠姦', label: '🛌 睡眠姦 / Sleep Sex [18+]' },
  { id: '逆レイプ', label: '⚠️ 逆レイプ / Reverse Rape [18+]' },
  { id: '処女喪失', label: '🩸 処女喪失 / Virginity Loss [18+]' },
  { id: '童貞卒業', label: '🎓 童貞卒業 / Male Virginity [18+]' },
  { id: 'おもらし', label: '🚾 おもらし / Omorashi [18+]' },
  { id: '風俗', label: '🧼 風俗 / Soapland [18+]' },
  { id: '催眠音声', label: '🌀 催眠音声 / Hypnotic Voice [18+]' },
];

// Helper: Check if work matches language filter
function matchesLanguage(w: any, lang: string): boolean {
  if (!lang || lang === 'all') return true;
  const attrs = (w.work_attributes || '').toUpperCase();
  const transLang = (w.translation_info?.lang || '').toUpperCase();
  const editions = getLanguageEditions(w).map((e: any) => (e && e.lang ? String(e.lang) : '').toUpperCase());

  if (lang === 'ja' || lang === 'JPN') {
    return attrs.includes('JPN') || editions.some((e: string) => e.includes('JPN')) || (!transLang && w.translation_info?.is_original !== false);
  }
  if (lang === 'zh' || lang === 'zh-hans' || lang === 'CHI_HANS') {
    return attrs.includes('CHI_HANS') || attrs.includes('CHI') || editions.some((e: string) => e.includes('CHI')) || transLang.includes('CHI') || /中文|汉化|简体/i.test(w.title);
  }
  if (lang === 'zh-hant' || lang === 'CHI_HANT') {
    return attrs.includes('CHI_HANT') || editions.some((e: string) => e.includes('CHI_HANT')) || /繁體|繁体/i.test(w.title);
  }
  if (lang === 'en' || lang === 'ENG') {
    return attrs.includes('ENG') || editions.some((e: string) => e.includes('ENG')) || transLang.includes('ENG') || /english|英語|en-us/i.test(w.title);
  }
  if (lang === 'ko' || lang === 'KO_KR') {
    return attrs.includes('KO_KR') || editions.some((e: string) => e.includes('KO_KR')) || transLang.includes('KO_KR') || /한국어|한국|korean/i.test(w.title);
  }
  return true;
}

function getWorkLanguageLabel(w: any): { code: string; label: string; flag: string } {
  const attrs = (w.work_attributes || '').toUpperCase();
  const transLang = (w.translation_info?.lang || '').toUpperCase();
  if (attrs.includes('CHI_HANS') || transLang.includes('CHI_HANS') || /【简体中文版】|【汉化】/i.test(w.title)) {
    return { code: 'zh-hans', label: '简中', flag: '🇨🇳' };
  }
  if (attrs.includes('CHI_HANT') || transLang.includes('CHI_HANT') || /【繁體中文版】/i.test(w.title)) {
    return { code: 'zh-hant', label: '繁中', flag: '🇹🇼' };
  }
  if (attrs.includes('ENG') || transLang.includes('ENG') || /【English】/i.test(w.title)) {
    return { code: 'en', label: 'ENG', flag: '🇬🇧' };
  }
  if (attrs.includes('KO_KR') || transLang.includes('KO_KR')) {
    return { code: 'ko', label: '한국어', flag: '🇰🇷' };
  }
  return { code: 'ja', label: '日本語', flag: '🇯🇵' };
}

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

    // If query is empty and tag is provided, search upstream for the tag
    if (!query && tag) {
      query = tag;
    } else if (!query && lang !== 'all') {
      if (lang === 'zh' || lang === 'zh-hans') query = '中文';
      else if (lang === 'zh-hant') query = '繁體';
      else if (lang === 'en') query = 'ENG';
      else if (lang === 'ko') query = '한국어';
    }

    let targetUrl = `https://api.asmr.one/api/search/${encodeURIComponent(query)}?page=${page}&order=${order}&sort=${sort}`;
    if (subtitle !== undefined && subtitle !== '') {
      targetUrl += `&subtitle=${subtitle}`;
    }

    const upstreamRes = await fetch(targetUrl, { headers: ASMR_API_HEADERS });
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({ error: `Upstream returned status ${upstreamRes.status}` });
    }
    const data = await upstreamRes.json();
    if (data.works) {
      if (lang && lang !== 'all') {
        data.works = data.works.filter((w: any) => matchesLanguage(w, lang));
      }
      if (tag) {
        data.works = data.works.filter((w: any) => matchesTag(w, tag));
      }
      if (nsfw === 'sfw') {
        data.works = data.works.filter((w: any) => w.nsfw === false);
      } else if (nsfw === 'nsfw') {
        data.works = data.works.filter((w: any) => w.nsfw === true);
      }
    }
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

// Download Zip Stream on the fly
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
      return res.status(404).send('No downloadable files found');
    }

    const rjCode = workData?.source_id || `RJ${resolved.numericId}`;
    const archive = archiver('zip', {
      zlib: { level: 0 }, // store or fast compression for audio
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${rjCode}_archive.zip"`);

    archive.on('error', (err: any) => {
      console.error('Archiver error:', err);
      if (!res.headersSent) res.status(500).send('Archive error');
    });

    archive.pipe(res);

    // Download files sequentially to conserve memory and handle streaming
    for (const track of flattened) {
      const url = track.mediaDownloadUrl || track.mediaStreamUrl;
      if (!url) continue;

      try {
        const fileRes = await fetch(url, { headers: ASMR_API_HEADERS });
        if (fileRes.ok && fileRes.body) {
          // @ts-ignore
          const { Readable } = await import('stream');
          // @ts-ignore
          const stream = Readable.fromWeb(fileRes.body);
          archive.append(stream, { name: track.path });
        }
      } catch (fErr) {
        console.error(`Failed to add ${track.path} to zip:`, fErr);
      }
    }

    await archive.finalize();
  } catch (err: any) {
    console.error('Zip download error:', err);
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
    const { text, targetLang = 'en', sourceLang = 'Japanese', mode = 'translated', tone = 'asmr' } = req.body;
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
    const result = await translateScript(text, { targetLang, mode, tone });

    const safeBase = path.basename(originalName).replace(/\.[^/.]+$/, '');
    const downloadFilename = `${safeBase}_${targetLang}_${mode}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFilename)}"`);
    return res.send(result.translatedText);
  } catch (err: any) {
    console.error('Download translation error:', err);
    return res.status(500).send('Translation download error: ' + err.message);
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

// Retro SSR Layout Template
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
      <span class="device-indicator">Opera Mini / Symbian</span>
      <a href="/classic?img=${imgMode}&lang=${langMode}">&#9776; RetroASMR Lite</a>
    </div>
    <div class="subnav">
      <a href="/classic?img=${imgMode}&lang=${langMode}">[Home]</a>
      <a href="/classic/search?tag=耳かき&img=${imgMode}&lang=${langMode}">[👂Ear Clean]</a>
      <a href="/classic/search?tag=囁き&img=${imgMode}&lang=${langMode}">[🤫Whisper]</a>
      <a href="/classic/search?tag=マッサージ&img=${imgMode}&lang=${langMode}">[💆Massage]</a>
      <a href="/classic/search?tag=安眠&img=${imgMode}&lang=${langMode}">[💤Sleep]</a>
      <a href="/classic/search?tag=純愛&img=${imgMode}&lang=${langMode}">[💖Pure Love]</a>
      <a href="/classic/search?tag=バイノーラル&img=${imgMode}&lang=${langMode}">[🎙️Binaural]</a>
      ${tagMode ? `| Tag: <strong style="color:#b91c1c;">#${escapeHtml(tagMode)}</strong> <a href="?q=${encodeURIComponent(activeQuery)}&img=${imgMode}&lang=${langMode}">[Clear Tag]</a>` : ''}
      | Img:
      ${imgMode === '0' ? '<strong>No Img</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=0&lang=${langMode}">[No Img]</a>`}
      ${imgMode === '1' ? '<strong>240px</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=1&lang=${langMode}">[240px]</a>`}
      | Lang:
      ${langMode === 'all' ? '<strong>All</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=all">[All]</a>`}
      ${langMode === 'ja' ? '<strong>JP</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=ja">[JP]</a>`}
      ${langMode === 'zh-hans' ? '<strong>简中</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=zh-hans">[简中]</a>`}
      ${langMode === 'zh-hant' ? '<strong>繁中</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=zh-hant">[繁中]</a>`}
      ${langMode === 'en' ? '<strong>EN</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=en">[EN]</a>`}
      | <a href="/">[Modern UI]</a>
    </div>
    <div class="content">
      ${bodyContent}
    </div>
    <div class="footer">
      RetroASMR Engine &bull; Optimized for Symbian OS (S60v3/v5/^3), Opera Mini 4-8, WAP &amp; Low Bandwidth<br />
      Direct downloads include resume support. RealPlayer / CorePlayer compatible M3U streaming.<br />
      <a href="/classic?img=${imgMode}&lang=${langMode}">Back to Top</a> | <a href="/">Switch to Modern Desktop UI</a>
    </div>
  </div>
</body>
</html>`;
}

// Route: /classic (SSR Home)
app.get('/classic', async (req: Request, res: Response) => {
  const imgMode = (req.query.img as string) || '1';
  const langMode = (req.query.lang as string) || 'all';
  const tagMode = (req.query.tag as string) || '';
  const order = (req.query.order as string) || 'release';
  const sort = (req.query.sort as string) || 'desc';

  let popularHtml = '';
  try {
    let targetSearch = tagMode;
    if (!targetSearch && langMode !== 'all') {
      if (langMode === 'zh-hans' || langMode === 'zh') targetSearch = '中文';
      else if (langMode === 'zh-hant') targetSearch = '繁體';
      else if (langMode === 'en') targetSearch = 'ENG';
      else if (langMode === 'ko') targetSearch = '한국어';
    }

    const popRes = await fetch(`https://api.asmr.one/api/search/${encodeURIComponent(targetSearch)}?order=${order}&sort=${sort}&page=1`, {
      headers: ASMR_API_HEADERS,
    });
    if (popRes.ok) {
      const data = await popRes.json();
      let works = data.works || [];
      if (langMode !== 'all') {
        works = works.filter((w: any) => matchesLanguage(w, langMode));
      }
      if (tagMode) {
        works = works.filter((w: any) => matchesTag(w, tagMode));
      }
      works = works.slice(0, 10);
      const sortTitle = order === 'release' ? '🆕 Recent ASMR Releases (最新)' : order === 'dl_count' ? '🔥 Top Downloaded (人気)' : order === 'rating' ? '⭐ Highest Rated (高評価)' : '✨ Recently Added (新着)';
      popularHtml = `<h3>${sortTitle} ${tagMode ? `(#${escapeHtml(tagMode)})` : ''} (${langMode.toUpperCase()})</h3>`;
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
            Editions: ${edList.map((ed: any) => `<a href="/classic/work/${ed.workno}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[${escapeHtml(ed.label)}: ${escapeHtml(ed.workno)}]</a>`).join(' ')}
          </div>`;
        }

        const tagsHtml = (w.tags && w.tags.length > 0)
          ? `<div class="meta-tag" style="margin-top:2px;">Tags: ${w.tags.slice(0, 5).map((t: any) => `<a href="/classic/search?tag=${encodeURIComponent(t.name)}&img=${imgMode}&lang=${langMode}&order=${order}" style="color:#0284c7; text-decoration:underline; margin-right:3px;">[#${escapeHtml(t.name)}]</a>`).join(' ')}</div>`
          : '';

        popularHtml += `
          <div class="work-item">
            <span class="badge badge-rj">${escapeHtml(w.source_id || 'RJ' + w.id)}</span>
            <span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">${escapeHtml(langInfo.flag + ' ' + langInfo.label)}</span>
            <span class="badge badge-rating">&#9733; ${escapeHtml(String(w.rate_average_2dp || '0'))}</span>
            <div class="work-title">
              <a href="/classic/work/${w.id}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">${escapeHtml(w.title)}</a>
            </div>
            ${coverHtml}
            <div class="meta-tag">
              Circle: <strong>${escapeHtml(w.name || 'N/A')}</strong> | CV: ${escapeHtml(vaNames)}<br />
              DLs: ${escapeHtml(String(w.dl_count || 0))} | Released: ${escapeHtml(w.release || 'N/A')}
            </div>
            ${tagsHtml}
            ${editionsHtml}
            <div style="margin-top: 4px;">
              <a href="/classic/work/${w.id}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}" class="btn btn-sm">[Open &amp; Download Tracks]</a>
              <a href="/api/download/playlist.m3u?id=${w.id}" class="btn btn-green btn-sm">[RealPlayer M3U]</a>
            </div>
          </div>
        `;
      }
    }
  } catch (err) {
    popularHtml = '<p style="color:red;">Could not load works list.</p>';
  }

  const allPopularTags = [...CLASSIC_POPULAR_TAGS];
  if (tagMode && !allPopularTags.some((t) => t.id === tagMode || t.id.toLowerCase() === tagMode.toLowerCase())) {
    allPopularTags.unshift({ id: tagMode, label: `🏷️ #${tagMode} (Active)` });
  }
  const tagSelectOptions = allPopularTags.map(
    (t) => `<option value="${escapeHtml(t.id)}" ${tagMode === t.id ? 'selected' : ''}>${escapeHtml(t.label)}</option>`
  ).join('');

  const content = `
    <div style="font-size:11px; margin-bottom:6px; background:#f1f5f9; padding:5px 8px; border:1px solid #cbd5e1;">
      <strong>View Mode:</strong> 
      ${order === 'release' ? '<strong style="color:#b91c1c;">[🆕 Recent Releases]</strong>' : `<a href="/classic?order=release&img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[🆕 Recent Releases]</a>`} |
      ${order === 'dl_count' ? '<strong style="color:#b91c1c;">[🔥 Top Popular]</strong>' : `<a href="/classic?order=dl_count&img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[🔥 Top Popular]</a>`} |
      ${order === 'rating' ? '<strong style="color:#b91c1c;">[⭐ Top Rated]</strong>' : `<a href="/classic?order=rating&img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[⭐ Top Rated]</a>`} |
      ${order === 'create_date' ? '<strong style="color:#b91c1c;">[✨ Recently Added]</strong>' : `<a href="/classic?order=create_date&img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[✨ Recently Added]</a>`}
    </div>

    <div class="search-box">
      <form action="/classic/search" method="GET">
        <input type="hidden" name="img" value="${escapeHtml(imgMode)}" />
        <label for="q"><strong>Search ASMR.one:</strong></label><br />
        <input type="text" id="q" name="q" placeholder="RJ01632573, voice actor, or keyword" value="" style="margin-bottom:4px;" /><br />
        
        <label for="order"><strong>Sort:</strong></label>
        <select name="order" id="order" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="release" ${order === 'release' ? 'selected' : ''}>🆕 Recent (最新リリース)</option>
          <option value="dl_count" ${order === 'dl_count' ? 'selected' : ''}>🔥 Top DLs (人気順)</option>
          <option value="rating" ${order === 'rating' ? 'selected' : ''}>⭐ Rating (高評価順)</option>
          <option value="create_date" ${order === 'create_date' ? 'selected' : ''}>✨ New (新着登録)</option>
          <option value="review_count" ${order === 'review_count' ? 'selected' : ''}>💬 Reviews (感想順)</option>
        </select>

        <label for="lang"><strong>Lang:</strong></label>
        <select name="lang" id="lang" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="all" ${langMode === 'all' ? 'selected' : ''}>All Languages (すべて)</option>
          <option value="ja" ${langMode === 'ja' ? 'selected' : ''}>Japanese (日本語)</option>
          <option value="zh-hans" ${langMode === 'zh-hans' ? 'selected' : ''}>Simplified Chinese (简体中文)</option>
          <option value="zh-hant" ${langMode === 'zh-hant' ? 'selected' : ''}>Traditional Chinese (繁體中文)</option>
          <option value="en" ${langMode === 'en' ? 'selected' : ''}>English (ENG)</option>
          <option value="ko" ${langMode === 'ko' ? 'selected' : ''}>Korean (한국어)</option>
        </select>

        <label for="tag"><strong>Tag:</strong></label>
        <select name="tag" id="tag" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="">All Tags (すべてのタグ)</option>
          ${tagSelectOptions}
        </select>
        <input type="submit" value="Search" />
      </form>
      <div style="font-size:11px; margin-top:5px; color:#475569;">
        Quick Tags: 
        <a href="/classic/search?tag=耳かき&img=${imgMode}&lang=${langMode}&order=${order}">[耳かき]</a>
        <a href="/classic/search?tag=囁き&img=${imgMode}&lang=${langMode}&order=${order}">[囁き]</a>
        <a href="/classic/search?tag=耳舐め&img=${imgMode}&lang=${langMode}&order=${order}">[耳舐め(18+)]</a>
        <a href="/classic/search?tag=オナサポート&img=${imgMode}&lang=${langMode}&order=${order}">[オナサポ(18+)]</a>
        <a href="/classic/search?tag=安眠&img=${imgMode}&lang=${langMode}&order=${order}">[安眠]</a>
        <a href="/classic/search?tag=純愛&img=${imgMode}&lang=${langMode}&order=${order}">[純愛]</a>
        <a href="/classic/search?tag=バイノーラル&img=${imgMode}&lang=${langMode}&order=${order}">[バイノーラル]</a>
      </div>
    </div>

    <div class="info-box">
      <strong>&#128241; Opera Mini &amp; Symbian Guide:</strong><br />
      &bull; <strong>Recent vs Top Sort:</strong> Toggle between [🆕 Recent Releases] and [🔥 Top Popular] with 1 click above.<br />
      &bull; <strong>Tag Filtering:</strong> SFW and 18+ adult tags now available via the Tag dropdown and clickable tag links.<br />
      &bull; <strong>Downloads:</strong> Click [Open &amp; Download Tracks] on any track to download directly to your Symbian memory card (E:\\).<br />
      &bull; <strong>RealPlayer Streaming:</strong> Click [RealPlayer M3U] to stream all audio tracks in sequence inside native Symbian RealPlayer or CorePlayer.<br />
      &bull; <strong>Language Filter:</strong> Switch language filter at top to find Japanese original or Chinese/English translated editions.<br />
      &bull; <strong>2G Data Saver:</strong> Click [No Img] in the top subnav to disable cover photos and save 98% mobile data.
    </div>

    ${popularHtml}
  `;

  return res.send(renderRetroPage('Home', content, '', imgMode, langMode, tagMode));
});

// Route: /classic/search (SSR Search Results)
app.get('/classic/search', async (req: Request, res: Response) => {
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
    let targetSearch = query || tagMode;
    if (!targetSearch && langMode !== 'all') {
      if (langMode === 'zh' || langMode === 'zh-hans') targetSearch = '中文';
      else if (langMode === 'zh-hant') targetSearch = '繁體';
      else if (langMode === 'en') targetSearch = 'ENG';
      else if (langMode === 'ko') targetSearch = '한국어';
    }

    const searchUrl = `https://api.asmr.one/api/search/${encodeURIComponent(targetSearch)}?page=${page}&order=${order}&sort=${sort}`;
    const upstreamRes = await fetch(searchUrl, { headers: ASMR_API_HEADERS });

    if (upstreamRes.ok) {
      const data = await upstreamRes.json();
      let works = data.works || [];
      if (langMode !== 'all') {
        works = works.filter((w: any) => matchesLanguage(w, langMode));
      }
      if (tagMode) {
        works = works.filter((w: any) => matchesTag(w, tagMode));
      }
      const total = data.pagination?.totalCount || 0;
      const pageSize = data.pagination?.pageSize || 20;
      const totalPages = Math.ceil(total / pageSize) || 1;

      const orderLabel = order === 'release' ? '🆕 Recent Releases' : order === 'dl_count' ? '🔥 Top Downloads' : order === 'rating' ? '⭐ Highest Rated' : '✨ Recently Added';

      resultsHtml += `
        <div style="font-size:11px; margin-bottom:8px; padding:4px 6px; background:#f1f5f9; border:1px solid #cbd5e1;">
          <strong>Sort:</strong> 
          ${order === 'release' ? '<strong style="color:#b91c1c;">[🆕 Recent Releases]</strong>' : `<a href="/classic/search?q=${encodeURIComponent(query)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=${langMode}&order=release">[🆕 Recent]</a>`} |
          ${order === 'dl_count' ? '<strong style="color:#b91c1c;">[🔥 Top Popular]</strong>' : `<a href="/classic/search?q=${encodeURIComponent(query)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=${langMode}&order=dl_count">[🔥 Top DLs]</a>`} |
          ${order === 'rating' ? '<strong style="color:#b91c1c;">[⭐ Top Rated]</strong>' : `<a href="/classic/search?q=${encodeURIComponent(query)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=${langMode}&order=rating">[⭐ Top Rated]</a>`} |
          ${order === 'create_date' ? '<strong style="color:#b91c1c;">[✨ New Added]</strong>' : `<a href="/classic/search?q=${encodeURIComponent(query)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=${langMode}&order=create_date">[✨ New Added]</a>`}
        </div>

        <div style="font-size:12px; margin-bottom: 8px;">
          Found <strong>${works.length}</strong> works on this page for "<strong>${escapeHtml(query || tagMode || (langMode !== 'all' ? langMode.toUpperCase() : 'All'))}</strong>" (Sorted by: <strong>${orderLabel}</strong> &bull; Page ${page} of ${totalPages} &bull; Lang: ${escapeHtml(langMode.toUpperCase())})
          ${tagMode ? ` &bull; Tag: <strong style="color:#b91c1c;">#${escapeHtml(tagMode)}</strong> <a href="/classic/search?q=${encodeURIComponent(query)}&img=${imgMode}&lang=${langMode}&order=${order}">[Remove Tag Filter]</a>` : ''}
        </div>
      `;

      if (works.length === 0) {
        resultsHtml += '<p>No matching works found. Please check your keywords or change tag/language/sort filter.</p>';
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
              Editions: ${edList.map((ed: any) => `<a href="/classic/work/${ed.workno}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[${escapeHtml(ed.label)}: ${escapeHtml(ed.workno)}]</a>`).join(' ')}
            </div>`;
          }

          const tagsHtml = (w.tags && w.tags.length > 0)
            ? `<div class="meta-tag" style="margin-top:2px;">Tags: ${w.tags.slice(0, 5).map((t: any) => `<a href="/classic/search?tag=${encodeURIComponent(t.name)}&img=${imgMode}&lang=${langMode}&order=${order}" style="color:#0284c7; text-decoration:underline; margin-right:3px;">[#${escapeHtml(t.name)}]</a>`).join(' ')}</div>`
            : '';

          resultsHtml += `
            <div class="work-item">
              <span class="badge badge-rj">${escapeHtml(w.source_id || 'RJ' + w.id)}</span>
              <span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">${escapeHtml(langInfo.flag + ' ' + langInfo.label)}</span>
              <span class="badge badge-rating">&#9733; ${escapeHtml(String(w.rate_average_2dp || '0'))}</span>
              <div class="work-title">
                <a href="/classic/work/${w.id}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">${escapeHtml(w.title)}</a>
              </div>
              ${coverHtml}
              <div class="meta-tag">
                Circle: <strong>${escapeHtml(w.name || 'N/A')}</strong> | CV: ${escapeHtml(vaNames)}<br />
                DLs: ${escapeHtml(String(w.dl_count || 0))} | Released: ${escapeHtml(w.release || 'N/A')}
              </div>
              ${tagsHtml}
              ${editionsHtml}
              <div style="margin-top: 5px;">
                <a href="/classic/work/${w.id}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}" class="btn btn-sm">[View Tracks]</a>
                <a href="/api/download/playlist.m3u?id=${w.id}" class="btn btn-green btn-sm">[Stream M3U]</a>
              </div>
            </div>
          `;
        }

        // Pagination links
        paginationHtml = '<div class="pagination">';
        if (page > 1) {
          paginationHtml += `<a href="/classic/search?q=${encodeURIComponent(query)}&tag=${encodeURIComponent(tagMode)}&page=${page - 1}&img=${imgMode}&lang=${langMode}&order=${order}&sort=${sort}">&laquo; Previous Page</a> | `;
        }
        paginationHtml += `Page ${page} / ${totalPages}`;
        if (page < totalPages) {
          paginationHtml += ` | <a href="/classic/search?q=${encodeURIComponent(query)}&tag=${encodeURIComponent(tagMode)}&page=${page + 1}&img=${imgMode}&lang=${langMode}&order=${order}&sort=${sort}">Next Page &raquo;</a>`;
        }
        paginationHtml += '</div>';
      }
    } else {
      resultsHtml = `<p style="color:red;">Search API returned error status ${upstreamRes.status}.</p>`;
    }
  } catch (err: any) {
    resultsHtml = `<p style="color:red;">Error connecting to ASMR search service: ${escapeHtml(err.message)}</p>`;
  }

  const allSearchTags = [...CLASSIC_POPULAR_TAGS];
  if (tagMode && !allSearchTags.some((t) => t.id === tagMode || t.id.toLowerCase() === tagMode.toLowerCase())) {
    allSearchTags.unshift({ id: tagMode, label: `🏷️ #${tagMode} (Active)` });
  }
  const tagSelectOptions = allSearchTags.map(
    (t) => `<option value="${escapeHtml(t.id)}" ${tagMode === t.id ? 'selected' : ''}>${escapeHtml(t.label)}</option>`
  ).join('');

  const content = `
    <div class="search-box">
      <form action="/classic/search" method="GET">
        <input type="hidden" name="img" value="${escapeHtml(imgMode)}" />
        <input type="text" name="q" value="${escapeHtml(query)}" placeholder="RJ code or keywords..." style="margin-bottom:4px;" /><br />
        
        <label for="order"><strong>Sort:</strong></label>
        <select name="order" id="order" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="release" ${order === 'release' ? 'selected' : ''}>🆕 Recent (最新リリース)</option>
          <option value="dl_count" ${order === 'dl_count' ? 'selected' : ''}>🔥 Top DLs (人気順)</option>
          <option value="rating" ${order === 'rating' ? 'selected' : ''}>⭐ Rating (高評価順)</option>
          <option value="create_date" ${order === 'create_date' ? 'selected' : ''}>✨ New (新着登録)</option>
          <option value="review_count" ${order === 'review_count' ? 'selected' : ''}>💬 Reviews (感想順)</option>
        </select>

        <label for="lang"><strong>Lang:</strong></label>
        <select name="lang" id="lang" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="all" ${langMode === 'all' ? 'selected' : ''}>All Languages (すべて)</option>
          <option value="ja" ${langMode === 'ja' ? 'selected' : ''}>Japanese (日本語)</option>
          <option value="zh-hans" ${langMode === 'zh-hans' ? 'selected' : ''}>Simplified Chinese (简体中文)</option>
          <option value="zh-hant" ${langMode === 'zh-hant' ? 'selected' : ''}>Traditional Chinese (繁體中文)</option>
          <option value="en" ${langMode === 'en' ? 'selected' : ''}>English (ENG)</option>
          <option value="ko" ${langMode === 'ko' ? 'selected' : ''}>Korean (한국어)</option>
        </select>

        <label for="tag"><strong>Tag:</strong></label>
        <select name="tag" id="tag" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="">All Tags (すべてのタグ)</option>
          ${tagSelectOptions}
        </select>
        <input type="submit" value="Search" />
      </form>
    </div>
    ${resultsHtml}
    ${paginationHtml}
  `;

  return res.send(renderRetroPage(`Search: ${query || tagMode || (langMode !== 'all' ? langMode.toUpperCase() : 'Popular')}`, content, query, imgMode, langMode, tagMode));
});

// Route: /classic/work/:id (SSR Work Details & Track List)
app.get('/classic/work/:id', async (req: Request, res: Response) => {
  const inputId = req.params.id;
  const imgMode = (req.query.img as string) || '1';

  try {
    const resolved = await resolveNumericWorkId(inputId);
    if (!resolved) {
      return res.status(404).send(renderRetroPage('Error', '<p style="color:red;">Work not found.</p>', '', imgMode));
    }

    const [workRes, tracksRes] = await Promise.all([
      fetch(`https://api.asmr.one/api/work/${resolved.numericId}`, { headers: ASMR_API_HEADERS }),
      fetch(`https://api.asmr.one/api/tracks/${resolved.numericId}`, { headers: ASMR_API_HEADERS }),
    ]);

    if (!tracksRes.ok) {
      return res.status(tracksRes.status).send(
        renderRetroPage('Error', `<p style="color:red;">Failed to retrieve tracks for work ${resolved.numericId}.</p>`, '', imgMode)
      );
    }

    const workData = workRes.ok ? await workRes.json() : null;
    const tracksData = await tracksRes.json();

    const flattened = flattenTracks(tracksData);
    const audioTracks = flattened.filter((t) => t.type === 'audio');
    const textTracks = flattened.filter((t) => t.type === 'text');
    const totalSize = flattened.reduce((acc, t) => acc + (t.size || 0), 0);

    const rjCode = workData?.source_id || `RJ${resolved.numericId}`;
    const title = workData?.title || `Work ${resolved.numericId}`;
    const circleName = workData?.name || 'N/A';
    const vas = (workData?.vas || []).map((v: any) => v.name).join(', ') || 'N/A';
    const tagMode = (req.query.tag as string) || '';
    const langMode = (req.query.lang as string) || 'all';

    const tagsHtml = (workData?.tags && workData.tags.length > 0)
      ? workData.tags.map((t: any) => `<a href="/classic/search?tag=${encodeURIComponent(t.name)}&img=${imgMode}&lang=${langMode}" class="btn btn-sm" style="margin:2px 3px 2px 0;">#${escapeHtml(t.name)}</a>`).join(' ')
      : 'None';

    const coverHtml =
      imgMode !== '0' && workData?.thumbnailCoverUrl
        ? `<div style="margin: 6px 0;"><img src="${escapeHtml(
            workData.thumbnailCoverUrl
          )}" width="160" height="160" alt="Cover" style="border:1px solid #94a3b8;" /></div>`
        : '';

    let tracksTableHtml = `
      <table class="track-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Track Name / Path</th>
            <th>Size</th>
            <th>Duration</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const track of flattened) {
      const url = track.mediaDownloadUrl || track.mediaStreamUrl;
      const downloadProxyUrl = `/api/download/file?url=${encodeURIComponent(url || '')}&name=${encodeURIComponent(
        track.title
      )}`;

      let typeBadge = `<span class="badge">${escapeHtml(track.type.toUpperCase())}</span>`;
      let actionsHtml = '';

      if (track.type === 'audio' && url) {
        typeBadge = `<span class="badge" style="background:#dbeafe; color:#1e40af;">AUDIO</span>`;
        actionsHtml = `
          <a href="${downloadProxyUrl}" class="btn btn-sm btn-green" title="Direct download to phone memory">[Download]</a>
          <a href="${url}" class="btn btn-sm" title="Direct audio stream link for RealPlayer">[Direct Link]</a>
        `;
      } else if (track.type === 'text' && url) {
        typeBadge = `<span class="badge" style="background:#fef3c7; color:#92400e;">TXT</span>`;
        actionsHtml = `
          <a href="/classic/text/${resolved.numericId}/${encodeURIComponent(track.hash || '')}?url=${encodeURIComponent(
          url
        )}&img=${imgMode}" class="btn btn-sm">[Read Script]</a>
          <a href="${downloadProxyUrl}" class="btn btn-sm btn-green">[Download]</a>
        `;
      } else if (url) {
        actionsHtml = `<a href="${downloadProxyUrl}" class="btn btn-sm btn-green">[Download]</a>`;
      }

      tracksTableHtml += `
        <tr>
          <td>${typeBadge}</td>
          <td><strong>${escapeHtml(track.title)}</strong><br /><span style="font-size:10px; color:#64748b;">${escapeHtml(
        track.path
      )}</span></td>
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

    const langInfo = getWorkLanguageLabel(workData || {});
    let editionsHtml = '';
    const edList = getLanguageEditions(workData);
    if (edList.length > 0) {
      editionsHtml = `<div style="margin-top: 4px; padding: 4px 6px; background:#f8fafc; border: 1px solid #cbd5e1; font-size:11px;">
        <strong>Language Editions:</strong>
        ${edList
          .map(
            (ed: any) =>
              `<a href="/classic/work/${ed.workno}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[${escapeHtml(ed.label)}: ${escapeHtml(ed.workno)}]</a>`
          )
          .join(' ')}
      </div>`;
    }

    const content = `
      <div style="margin-bottom: 10px;">
        <span class="badge badge-rj">${escapeHtml(rjCode)}</span>
        <span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">${escapeHtml(langInfo.flag + ' ' + langInfo.label)}</span>
        <span class="badge badge-rating">&#9733; ${escapeHtml(String(workData?.rate_average_2dp || 'N/A'))}</span>
        <h2 style="font-size: 15px; margin: 4px 0;">${escapeHtml(title)}</h2>
        ${coverHtml}
        <div class="meta-tag">
          <strong>Language:</strong> ${escapeHtml(langInfo.flag + ' ' + langInfo.label)} | <strong>Circle:</strong> ${escapeHtml(circleName)} | <strong>CV:</strong> ${escapeHtml(vas)}<br />
          <strong>Release:</strong> ${escapeHtml(workData?.release || 'N/A')} | <strong>Price:</strong> &yen;${escapeHtml(
      String(workData?.price || 0)
    )}<br />
          <strong>Total Size:</strong> ${escapeHtml(formatBytes(totalSize))} | <strong>Tracks:</strong> ${audioTracks.length} audio, ${textTracks.length} text<br />
          <strong>Tags:</strong> ${tagsHtml}
        </div>
        ${editionsHtml}
      </div>

      <div class="search-box" style="background:#e0f2fe; border-color:#7dd3fc;">
        <strong>&#128229; Symbian &amp; Opera Mini Quick Actions:</strong><br />
        <div style="margin-top: 6px;">
          <a href="/api/download/playlist.m3u?id=${resolved.numericId}" class="btn btn-green">[Play in RealPlayer (.M3U)]</a>
          <a href="/api/download/batch-links.txt?id=${resolved.numericId}" class="btn">[Download Links (.TXT)]</a>
          <a href="/api/download/batch-script.sh?id=${resolved.numericId}" class="btn">[Curl / Wget Script]</a>
          <a href="/api/download/zip/${resolved.numericId}" class="btn btn-amber">[Full ZIP Archive]</a>
        </div>
      </div>

      <h3>Files &amp; Tracks (${flattened.length} items)</h3>
      ${tracksTableHtml}
      <div style="margin-top: 10px;">
        <a href="/classic/search?q=${encodeURIComponent(circleName)}&img=${imgMode}">&laquo; More from Circle: ${escapeHtml(circleName)}</a>
      </div>
    `;

    return res.send(renderRetroPage(title, content, rjCode, imgMode, langMode, tagMode));
  } catch (err: any) {
    console.error('Classic work view error:', err);
    return res.status(500).send(renderRetroPage('Error', `<p style="color:red;">Error loading work: ${escapeHtml(err.message)}</p>`, '', imgMode));
  }
});

// Route: /classic/text/:workId/:hash (SSR Plain Text / Voice Drama Script Reader with Translation)
app.get('/classic/text/:workId/:hash', async (req: Request, res: Response) => {
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

    let displayContent = rawTextContent;
    let translationMetaHtml = '';
    let isTranslated = false;

    if (targetLang && targetLang !== 'orig') {
      try {
        const transResult = await translateScript(rawTextContent, {
          targetLang,
          mode: mode === 'orig' ? 'translated' : mode,
          tone,
        });
        displayContent = transResult.translatedText;
        isTranslated = true;

        const langLabels: Record<string, string> = {
          en: '🇬🇧 English (ENG)',
          'zh-hans': '🇨🇳 简体中文 (Simplified Chinese)',
          'zh-hant': '🇹🇼 繁體中文 (Traditional Chinese)',
          ko: '🇰🇷 한국어 (Korean)',
          ja: '🇯🇵 日本語 (Japanese)',
          vi: '🇻🇳 Tiếng Việt (Vietnamese)',
          es: '🇪🇸 Español (Spanish)',
          fr: '🇫🇷 Français (French)',
          de: '🇩🇪 Deutsch (German)',
          ru: '🇷🇺 Русский (Russian)',
          id: '🇮🇩 Bahasa Indonesia',
          th: '🇹🇭 ไทย (Thai)',
        };

        const activeLangLabel = langLabels[targetLang] || targetLang;
        const modeLabel = mode === 'bilingual' ? 'Bilingual Interleaved (対訳)' : 'Translated Only (翻訳)';

        translationMetaHtml = `
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:8px; margin-bottom:10px; font-size:11px; color:#166534;">
            <strong>✨ Translation Active:</strong> ${escapeHtml(activeLangLabel)} &bull; <strong>Format:</strong> ${escapeHtml(modeLabel)}<br />
            <strong>AI Engine:</strong> ${escapeHtml(transResult.engine)} &bull; <strong>Characters:</strong> ${transResult.charCount.toLocaleString()}<br />
            <div style="margin-top:6px;">
              <a href="/api/download/translated-script?url=${encodeURIComponent(targetUrl)}&targetLang=${encodeURIComponent(targetLang)}&mode=${encodeURIComponent(mode)}&name=script_${workId}.txt" class="btn btn-sm btn-green">[📥 Download Translated .TXT]</a>
              <a href="/classic/text/${workId}/${encodeURIComponent(req.params.hash)}?url=${encodeURIComponent(targetUrl)}&img=${imgMode}&targetLang=orig" class="btn btn-sm">[View Original Japanese]</a>
            </div>
          </div>
        `;
      } catch (tErr: any) {
        translationMetaHtml = `<p style="color:red; font-size:11px;">Translation failed: ${escapeHtml(tErr.message)}</p>`;
      }
    }

    const downloadOriginalUrl = `/api/download/file?url=${encodeURIComponent(targetUrl)}&name=script_${workId}_orig.txt`;

    const content = `
      <div style="margin-bottom: 8px;">
        <a href="/classic/work/${workId}?img=${imgMode}" class="btn btn-sm">&laquo; Back to Work Details</a>
        <a href="${downloadOriginalUrl}" class="btn btn-sm btn-green" style="margin-left:4px;">[Download Original .TXT]</a>
      </div>

      <div class="search-box" style="background:#f1f5f9; border-color:#cbd5e1; margin-bottom:10px;">
        <strong>🌐 AI Script &amp; Voice Drama Translator:</strong>
        <form action="/classic/text/${workId}/${encodeURIComponent(req.params.hash)}" method="GET" style="margin-top:6px;">
          <input type="hidden" name="url" value="${escapeHtml(targetUrl)}" />
          <input type="hidden" name="img" value="${escapeHtml(imgMode)}" />
          
          <label for="targetLang"><strong>Translate to:</strong></label>
          <select name="targetLang" id="targetLang" style="font-size:11px; padding:2px; margin-right:4px;">
            <option value="orig" ${targetLang === 'orig' ? 'selected' : ''}>🇯🇵 Original (原文)</option>
            <option value="en" ${targetLang === 'en' ? 'selected' : ''}>🇬🇧 English (英語)</option>
            <option value="zh-hans" ${targetLang === 'zh-hans' ? 'selected' : ''}>🇨🇳 简体中文 (Simplified Chinese)</option>
            <option value="zh-hant" ${targetLang === 'zh-hant' ? 'selected' : ''}>🇹🇼 繁體中文 (Traditional Chinese)</option>
            <option value="ko" ${targetLang === 'ko' ? 'selected' : ''}>🇰🇷 한국어 (Korean)</option>
            <option value="vi" ${targetLang === 'vi' ? 'selected' : ''}>🇻🇳 Tiếng Việt (Vietnamese)</option>
            <option value="es" ${targetLang === 'es' ? 'selected' : ''}>🇪🇸 Español (Spanish)</option>
            <option value="fr" ${targetLang === 'fr' ? 'selected' : ''}>🇫🇷 Français (French)</option>
            <option value="de" ${targetLang === 'de' ? 'selected' : ''}>🇩🇪 Deutsch (German)</option>
            <option value="ru" ${targetLang === 'ru' ? 'selected' : ''}>🇷🇺 Русский (Russian)</option>
            <option value="id" ${targetLang === 'id' ? 'selected' : ''}>🇮🇩 Bahasa Indonesia</option>
            <option value="th" ${targetLang === 'th' ? 'selected' : ''}>🇹🇭 ไทย (Thai)</option>
          </select>

          <label for="mode"><strong>Mode:</strong></label>
          <select name="mode" id="mode" style="font-size:11px; padding:2px; margin-right:4px;">
            <option value="translated" ${mode === 'translated' ? 'selected' : ''}>Translated Only (翻訳のみ)</option>
            <option value="bilingual" ${mode === 'bilingual' ? 'selected' : ''}>Bilingual Interleaved (対訳)</option>
            <option value="orig" ${mode === 'orig' ? 'selected' : ''}>Original Only (原文)</option>
          </select>

          <input type="submit" value="Translate Script (翻訳)" class="btn btn-sm" />
        </form>
      </div>

      ${translationMetaHtml}

      <h3>${isTranslated ? 'Translated Script View' : 'Original Script / Text Viewer'}</h3>
      <div style="background:#ffffff; border:1px solid #cbd5e1; padding:10px; font-family:monospace; font-size:12px; white-space:pre-wrap; word-wrap:break-word; max-height:650px; overflow-y:auto; line-height:1.5; color:#0f172a;">
${escapeHtml(displayContent)}
      </div>
      <div style="margin-top: 8px;">
        <a href="/classic/work/${workId}?img=${imgMode}" class="btn btn-sm">&laquo; Back to Work Details</a>
      </div>
    `;

    return res.send(renderRetroPage(isTranslated ? `Script (${targetLang.toUpperCase()})` : 'Script Viewer', content, '', imgMode));
  } catch (err: any) {
    return res.status(500).send('Error reading or translating script text');
  }
});

// ==========================================
// VITE DEV SERVER OR PRODUCTION STATIC FILES
// ==========================================

async function startServer() {
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
      app.get('*', (req: Request, res: Response) => {
        // Skip API and classic routes from fallback
        if (req.path.startsWith('/api') || req.path.startsWith('/classic')) {
          return res.status(404).send('Not Found');
        }
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log(`Classic Opera Mini / Symbian engine available at http://0.0.0.0:${PORT}/classic`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
