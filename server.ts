import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';

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
    const order = req.query.order || 'dl_count';
    const sort = req.query.sort || 'desc';
    const subtitle = req.query.subtitle;
    const lang = (req.query.lang as string) || 'all';

    // If query is empty and user picked a specific language, target that language directly upstream
    if (!query && lang !== 'all') {
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
    if (lang && lang !== 'all' && data.works) {
      data.works = data.works.filter((w: any) => matchesLanguage(w, lang));
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
function renderRetroPage(title: string, bodyContent: string, activeQuery: string = '', imgMode: string = '1', langMode: string = 'all'): string {
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
      <a href="/classic/search?q=whisper&img=${imgMode}&lang=${langMode}">[Whisper]</a>
      <a href="/classic/search?q=ear+cleaning&img=${imgMode}&lang=${langMode}">[Ear Clean]</a>
      <a href="/classic/search?q=&order=release&img=${imgMode}&lang=${langMode}">[New]</a>
      | Img:
      ${imgMode === '0' ? '<strong>No Img</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&img=0&lang=${langMode}">[No Img]</a>`}
      ${imgMode === '1' ? '<strong>240px</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&img=1&lang=${langMode}">[240px]</a>`}
      | Lang:
      ${langMode === 'all' ? '<strong>All</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&img=${imgMode}&lang=all">[All]</a>`}
      ${langMode === 'ja' ? '<strong>JP</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&img=${imgMode}&lang=ja">[JP]</a>`}
      ${langMode === 'zh-hans' ? '<strong>简中</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&img=${imgMode}&lang=zh-hans">[简中]</a>`}
      ${langMode === 'zh-hant' ? '<strong>繁中</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&img=${imgMode}&lang=zh-hant">[繁中]</a>`}
      ${langMode === 'en' ? '<strong>EN</strong>' : `<a href="?q=${encodeURIComponent(activeQuery)}&img=${imgMode}&lang=en">[EN]</a>`}
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

  let popularHtml = '';
  try {
    let targetSearch = '';
    if (langMode === 'zh-hans' || langMode === 'zh') targetSearch = '中文';
    else if (langMode === 'zh-hant') targetSearch = '繁體';
    else if (langMode === 'en') targetSearch = 'ENG';
    else if (langMode === 'ko') targetSearch = '한국어';

    const popRes = await fetch(`https://api.asmr.one/api/search/${encodeURIComponent(targetSearch)}?order=dl_count&sort=desc&page=1`, {
      headers: ASMR_API_HEADERS,
    });
    if (popRes.ok) {
      const data = await popRes.json();
      let works = data.works || [];
      if (langMode !== 'all') {
        works = works.filter((w: any) => matchesLanguage(w, langMode));
      }
      works = works.slice(0, 10);
      popularHtml = `<h3>&#9733; Popular ASMR Works (${langMode.toUpperCase()})</h3>`;
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
            Editions: ${edList.map((ed: any) => `<a href="/classic/work/${ed.workno}?img=${imgMode}&lang=${langMode}">[${escapeHtml(ed.label)}: ${escapeHtml(ed.workno)}]</a>`).join(' ')}
          </div>`;
        }

        popularHtml += `
          <div class="work-item">
            <span class="badge badge-rj">${escapeHtml(w.source_id || 'RJ' + w.id)}</span>
            <span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">${escapeHtml(langInfo.flag + ' ' + langInfo.label)}</span>
            <span class="badge badge-rating">&#9733; ${escapeHtml(String(w.rate_average_2dp || '0'))}</span>
            <div class="work-title">
              <a href="/classic/work/${w.id}?img=${imgMode}&lang=${langMode}">${escapeHtml(w.title)}</a>
            </div>
            ${coverHtml}
            <div class="meta-tag">
              Circle: <strong>${escapeHtml(w.name || 'N/A')}</strong> | CV: ${escapeHtml(vaNames)}<br />
              DLs: ${escapeHtml(String(w.dl_count || 0))} | Released: ${escapeHtml(w.release || 'N/A')}
            </div>
            ${editionsHtml}
            <div style="margin-top: 4px;">
              <a href="/classic/work/${w.id}?img=${imgMode}&lang=${langMode}" class="btn btn-sm">[Open &amp; Download Tracks]</a>
              <a href="/api/download/playlist.m3u?id=${w.id}" class="btn btn-green btn-sm">[RealPlayer M3U]</a>
            </div>
          </div>
        `;
      }
    }
  } catch (err) {
    popularHtml = '<p style="color:red;">Could not load popular works list.</p>';
  }

  const content = `
    <div class="search-box">
      <form action="/classic/search" method="GET">
        <input type="hidden" name="img" value="${escapeHtml(imgMode)}" />
        <label for="q"><strong>Search ASMR.one:</strong></label><br />
        <input type="text" id="q" name="q" placeholder="RJ01632573, voice actor, or keyword" value="" style="margin-bottom:4px;" /><br />
        
        <label for="lang"><strong>Language:</strong></label>
        <select name="lang" id="lang" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="all" ${langMode === 'all' ? 'selected' : ''}>All Languages (すべて)</option>
          <option value="ja" ${langMode === 'ja' ? 'selected' : ''}>Japanese (日本語)</option>
          <option value="zh-hans" ${langMode === 'zh-hans' ? 'selected' : ''}>Simplified Chinese (简体中文)</option>
          <option value="zh-hant" ${langMode === 'zh-hant' ? 'selected' : ''}>Traditional Chinese (繁體中文)</option>
          <option value="en" ${langMode === 'en' ? 'selected' : ''}>English (ENG)</option>
          <option value="ko" ${langMode === 'ko' ? 'selected' : ''}>Korean (한국어)</option>
        </select>
        <input type="submit" value="Search" />
      </form>
      <div style="font-size:11px; margin-top:5px; color:#475569;">
        Try: <a href="/classic/search?q=RJ01632573&img=${imgMode}&lang=${langMode}">RJ01632573</a>,
        <a href="/classic/search?q=whisper&img=${imgMode}&lang=${langMode}">whisper</a>,
        <a href="/classic/search?q=中文&img=${imgMode}&lang=zh-hans">Chinese (中文)</a>,
        <a href="/classic/search?q=ENG&img=${imgMode}&lang=en">English (ENG)</a>
      </div>
    </div>

    <div class="info-box">
      <strong>&#128241; Opera Mini &amp; Symbian Guide:</strong><br />
      &bull; <strong>Downloads:</strong> Click [Download] on any track to download directly to your Symbian memory card (E:\\).<br />
      &bull; <strong>RealPlayer Streaming:</strong> Click [RealPlayer M3U] to stream all audio tracks in sequence inside native Symbian RealPlayer or CorePlayer.<br />
      &bull; <strong>Language Filter:</strong> Switch language filter at top to find Japanese original or Chinese/English translated editions.<br />
      &bull; <strong>2G Data Saver:</strong> Click [No Img] in the top subnav to disable cover photos and save 98% mobile data.
    </div>

    ${popularHtml}
  `;

  return res.send(renderRetroPage('Home', content, '', imgMode, langMode));
});

// Route: /classic/search (SSR Search Results)
app.get('/classic/search', async (req: Request, res: Response) => {
  let query = (req.query.q as string) || '';
  const page = parseInt((req.query.page as string) || '1', 10) || 1;
  const imgMode = (req.query.img as string) || '1';
  const langMode = (req.query.lang as string) || 'all';
  const order = (req.query.order as string) || 'dl_count';
  const sort = (req.query.sort as string) || 'desc';

  let resultsHtml = '';
  let paginationHtml = '';

  try {
    let targetSearch = query;
    if (!query && langMode !== 'all') {
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
      const total = data.pagination?.totalCount || 0;
      const pageSize = data.pagination?.pageSize || 20;
      const totalPages = Math.ceil(total / pageSize) || 1;

      resultsHtml += `<div style="font-size:12px; margin-bottom: 8px;">
        Found <strong>${works.length}</strong> works on this page for "<strong>${escapeHtml(query || (langMode !== 'all' ? langMode.toUpperCase() : 'All'))}</strong>" (Page ${page} of ${totalPages} &bull; Lang: ${escapeHtml(langMode.toUpperCase())})
      </div>`;

      if (works.length === 0) {
        resultsHtml += '<p>No matching works found. Please check your keywords or change language filter.</p>';
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
              Editions: ${edList.map((ed: any) => `<a href="/classic/work/${ed.workno}?img=${imgMode}&lang=${langMode}">[${escapeHtml(ed.label)}: ${escapeHtml(ed.workno)}]</a>`).join(' ')}
            </div>`;
          }

          resultsHtml += `
            <div class="work-item">
              <span class="badge badge-rj">${escapeHtml(w.source_id || 'RJ' + w.id)}</span>
              <span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">${escapeHtml(langInfo.flag + ' ' + langInfo.label)}</span>
              <span class="badge badge-rating">&#9733; ${escapeHtml(String(w.rate_average_2dp || '0'))}</span>
              <div class="work-title">
                <a href="/classic/work/${w.id}?img=${imgMode}&lang=${langMode}">${escapeHtml(w.title)}</a>
              </div>
              ${coverHtml}
              <div class="meta-tag">
                Circle: <strong>${escapeHtml(w.name || 'N/A')}</strong> | CV: ${escapeHtml(vaNames)}<br />
                DLs: ${escapeHtml(String(w.dl_count || 0))} | Released: ${escapeHtml(w.release || 'N/A')}
              </div>
              ${editionsHtml}
              <div style="margin-top: 5px;">
                <a href="/classic/work/${w.id}?img=${imgMode}&lang=${langMode}" class="btn btn-sm">[View Tracks]</a>
                <a href="/api/download/playlist.m3u?id=${w.id}" class="btn btn-green btn-sm">[Stream M3U]</a>
              </div>
            </div>
          `;
        }

        // Pagination links
        paginationHtml = '<div class="pagination">';
        if (page > 1) {
          paginationHtml += `<a href="/classic/search?q=${encodeURIComponent(query)}&page=${page - 1}&img=${imgMode}&lang=${langMode}&order=${order}&sort=${sort}">&laquo; Previous Page</a> | `;
        }
        paginationHtml += `Page ${page} / ${totalPages}`;
        if (page < totalPages) {
          paginationHtml += ` | <a href="/classic/search?q=${encodeURIComponent(query)}&page=${page + 1}&img=${imgMode}&lang=${langMode}&order=${order}&sort=${sort}">Next Page &raquo;</a>`;
        }
        paginationHtml += '</div>';
      }
    } else {
      resultsHtml = `<p style="color:red;">Search API returned error status ${upstreamRes.status}.</p>`;
    }
  } catch (err: any) {
    resultsHtml = `<p style="color:red;">Error connecting to ASMR search service: ${escapeHtml(err.message)}</p>`;
  }

  const content = `
    <div class="search-box">
      <form action="/classic/search" method="GET">
        <input type="hidden" name="img" value="${escapeHtml(imgMode)}" />
        <input type="text" name="q" value="${escapeHtml(query)}" placeholder="RJ code or keywords..." style="margin-bottom:4px;" /><br />
        <label for="lang"><strong>Lang:</strong></label>
        <select name="lang" id="lang" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="all" ${langMode === 'all' ? 'selected' : ''}>All Languages (すべて)</option>
          <option value="ja" ${langMode === 'ja' ? 'selected' : ''}>Japanese (日本語)</option>
          <option value="zh-hans" ${langMode === 'zh-hans' ? 'selected' : ''}>Simplified Chinese (简体中文)</option>
          <option value="zh-hant" ${langMode === 'zh-hant' ? 'selected' : ''}>Traditional Chinese (繁體中文)</option>
          <option value="en" ${langMode === 'en' ? 'selected' : ''}>English (ENG)</option>
          <option value="ko" ${langMode === 'ko' ? 'selected' : ''}>Korean (한국어)</option>
        </select>
        <input type="submit" value="Search" />
      </form>
    </div>
    ${resultsHtml}
    ${paginationHtml}
  `;

  return res.send(renderRetroPage(`Search: ${query || (langMode !== 'all' ? langMode.toUpperCase() : 'Popular')}`, content, query, imgMode, langMode));
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
    const tags = (workData?.tags || []).map((t: any) => t.name).join(', ') || 'N/A';

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

    const langMode = (req.query.lang as string) || 'all';
    const langInfo = getWorkLanguageLabel(workData || {});
    let editionsHtml = '';
    const edList = getLanguageEditions(workData);
    if (edList.length > 0) {
      editionsHtml = `<div style="margin-top: 4px; padding: 4px 6px; background:#f8fafc; border: 1px solid #cbd5e1; font-size:11px;">
        <strong>Language Editions:</strong>
        ${edList
          .map(
            (ed: any) =>
              `<a href="/classic/work/${ed.workno}?img=${imgMode}&lang=${langMode}">[${escapeHtml(ed.label)}: ${escapeHtml(ed.workno)}]</a>`
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
          <strong>Tags:</strong> ${escapeHtml(tags)}
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

    return res.send(renderRetroPage(title, content, rjCode, imgMode, langMode));
  } catch (err: any) {
    console.error('Classic work view error:', err);
    return res.status(500).send(renderRetroPage('Error', `<p style="color:red;">Error loading work: ${escapeHtml(err.message)}</p>`, '', imgMode));
  }
});

// Route: /classic/text/:workId/:hash (SSR Plain Text / Voice Drama Script Reader)
app.get('/classic/text/:workId/:hash', async (req: Request, res: Response) => {
  const workId = req.params.workId;
  const targetUrl = req.query.url as string;
  const imgMode = (req.query.img as string) || '1';

  if (!targetUrl) {
    return res.status(400).send('Missing script URL');
  }

  try {
    const upstreamRes = await fetch(targetUrl, { headers: ASMR_API_HEADERS });
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send('Failed to fetch script text');
    }
    const textContent = await upstreamRes.text();

    const content = `
      <div style="margin-bottom: 8px;">
        <a href="/classic/work/${workId}?img=${imgMode}" class="btn btn-sm">&laquo; Back to Work Details</a>
      </div>
      <h3>Script / Text Viewer</h3>
      <div style="background:#ffffff; border:1px solid #cbd5e1; padding:10px; font-family:monospace; font-size:12px; white-space:pre-wrap; word-wrap:break-word; max-height:600px; overflow-y:auto;">
${escapeHtml(textContent)}
      </div>
      <div style="margin-top: 8px;">
        <a href="/classic/work/${workId}?img=${imgMode}" class="btn btn-sm">&laquo; Back to Work Details</a>
      </div>
    `;

    return res.send(renderRetroPage('Script Viewer', content, '', imgMode));
  } catch (err: any) {
    return res.status(500).send('Error reading script text');
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
