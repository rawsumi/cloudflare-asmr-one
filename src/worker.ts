import { Hono } from 'hono';

interface Env {
  ASSETS?: {
    fetch: (req: Request) => Promise<Response>;
  };
}

const app = new Hono<{ Bindings: Env }>();

// Upstream ASMR.one headers
const ASMR_API_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://www.asmr.one/',
  'Origin': 'https://www.asmr.one',
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

  if (/^\d+$/.test(trimmed)) {
    return { numericId: trimmed };
  }

  const match = trimmed.match(/^(?:RJ|VJ|BJ)?0*(\d+)$/i);
  if (match && match[1]) {
    return { numericId: match[1] };
  }

  try {
    const searchUrl = `https://api.asmr.one/api/search/${encodeURIComponent(trimmed)}?page=1`;
    const res = await fetch(searchUrl, { headers: ASMR_API_HEADERS });
    if (res.ok) {
      const data: any = await res.json();
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

function escapeHtml(str: string = ''): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
      background: #cc0000;
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
    .search-box input[type="text"] {
      padding: 4px;
      font-size: 12px;
      width: 70%;
      border: 1px solid #94a3b8;
    }
    .search-box input[type="submit"] {
      padding: 4px 10px;
      font-size: 12px;
      background: #0284c7;
      color: #ffffff;
      border: 1px solid #0369a1;
      font-weight: bold;
    }
    .work-item {
      border-bottom: 1px dashed #cbd5e1;
      padding: 8px 0;
    }
    .work-title {
      font-size: 13px;
      font-weight: bold;
      color: #0369a1;
      margin-bottom: 3px;
    }
    .work-title a {
      color: #0369a1;
      text-decoration: underline;
    }
    .meta-tag {
      font-size: 11px;
      color: #475569;
      margin: 2px 0;
    }
    .btn {
      display: inline-block;
      padding: 3px 8px;
      font-size: 11px;
      text-decoration: none;
      border-radius: 3px;
      margin-right: 4px;
      margin-bottom: 4px;
      border: 1px solid #94a3b8;
      background: #f1f5f9;
      color: #1e293b;
    }
    .btn-green {
      background: #15803d;
      color: #ffffff;
      border-color: #166534;
      font-weight: bold;
    }
    .btn-green a, .btn-green {
      color: #ffffff;
    }
    .btn-amber {
      background: #d97706;
      color: #ffffff;
      border-color: #b45309;
      font-weight: bold;
    }
    .btn-sm {
      padding: 2px 6px;
      font-size: 10px;
    }
    .badge {
      display: inline-block;
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

function renderRetroPage(
  title: string,
  bodyContent: string,
  activeQuery: string = '',
  imgMode: string = '1',
  langMode: string = 'all'
): string {
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
      <span class="device-indicator">Cloudflare Edge &bull; Opera Mini</span>
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
      RetroASMR Engine &bull; Deployed on Cloudflare Workers (Edge Global CDN)<br />
      Direct downloads with HTTP Range resume support &bull; RealPlayer compatible M3U streaming.<br />
      <a href="/classic?img=${imgMode}&lang=${langMode}">Back to Top</a> | <a href="/">Switch to Modern Desktop UI</a>
    </div>
  </div>
</body>
</html>`;
}

// ==========================================
// REST API ENDPOINTS
// ==========================================

// 1. Search API
app.get('/api/search/:query?', async (c) => {
  try {
    let query = c.req.param('query') || c.req.query('q') || '';
    const page = c.req.query('page') || '1';
    const order = c.req.query('order') || 'dl_count';
    const sort = c.req.query('sort') || 'desc';
    const subtitle = c.req.query('subtitle');
    const lang = c.req.query('lang') || 'all';

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
      return c.json({ error: `Upstream returned status ${upstreamRes.status}` }, upstreamRes.status as any);
    }
    const data: any = await upstreamRes.json();
    if (lang && lang !== 'all' && data.works) {
      data.works = data.works.filter((w: any) => matchesLanguage(w, lang));
    }
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message || 'Internal server error' }, 500);
  }
});

// 2. Work details API
app.get('/api/work/:id', async (c) => {
  try {
    const resolved = await resolveNumericWorkId(c.req.param('id'));
    if (!resolved) {
      return c.json({ error: 'Work not found' }, 404);
    }
    const targetUrl = `https://api.asmr.one/api/work/${resolved.numericId}`;
    const upstreamRes = await fetch(targetUrl, { headers: ASMR_API_HEADERS });
    if (!upstreamRes.ok) {
      return c.json({ error: `Upstream error ${upstreamRes.status}` }, upstreamRes.status as any);
    }
    const data = await upstreamRes.json();
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message || 'Internal server error' }, 500);
  }
});

// 3. Tracks tree API
app.get('/api/tracks/:id', async (c) => {
  try {
    const resolved = await resolveNumericWorkId(c.req.param('id'));
    if (!resolved) {
      return c.json({ error: 'Work not found' }, 404);
    }
    const targetUrl = `https://api.asmr.one/api/tracks/${resolved.numericId}`;
    const upstreamRes = await fetch(targetUrl, { headers: ASMR_API_HEADERS });
    if (!upstreamRes.ok) {
      return c.json({ error: `Upstream error ${upstreamRes.status}` }, upstreamRes.status as any);
    }
    const data = await upstreamRes.json();
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message || 'Internal server error' }, 500);
  }
});

// 4. Download / Audio Streaming Proxy with HTTP Range Resume Support
app.get('/api/download/file', async (c) => {
  const targetUrl = c.req.query('url');
  const customFilename = c.req.query('name') || 'audio.mp3';

  if (!targetUrl) {
    return c.text('Missing url parameter', 400);
  }

  const forwardHeaders: Record<string, string> = { ...ASMR_API_HEADERS };
  const rangeHeader = c.req.header('range');
  if (rangeHeader) {
    forwardHeaders['Range'] = rangeHeader;
  }

  try {
    const upstreamRes = await fetch(targetUrl, { headers: forwardHeaders });
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', upstreamRes.headers.get('content-type') || 'application/octet-stream');
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Content-Disposition', `attachment; filename="${encodeURIComponent(customFilename)}"`);

    const contentLength = upstreamRes.headers.get('content-length');
    if (contentLength) responseHeaders.set('Content-Length', contentLength);

    const contentRange = upstreamRes.headers.get('content-range');
    if (contentRange) responseHeaders.set('Content-Range', contentRange);

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return c.text(`Download proxy error: ${err.message}`, 500);
  }
});

// 5. Playlist (.M3U) Generator for RealPlayer / CorePlayer
app.get('/api/download/playlist.m3u', async (c) => {
  const inputId = c.req.query('id') || '';
  if (!inputId) {
    return c.text('Missing id parameter', 400);
  }

  try {
    const resolved = await resolveNumericWorkId(inputId);
    if (!resolved) {
      return c.text('Work not found', 404);
    }

    const [workRes, tracksRes] = await Promise.all([
      fetch(`https://api.asmr.one/api/work/${resolved.numericId}`, { headers: ASMR_API_HEADERS }),
      fetch(`https://api.asmr.one/api/tracks/${resolved.numericId}`, { headers: ASMR_API_HEADERS }),
    ]);

    if (!tracksRes.ok) {
      return c.text('Could not fetch work tracks', tracksRes.status as any);
    }

    const workData: any = workRes.ok ? await workRes.json() : null;
    const tracksData: any = await tracksRes.json();
    const flattened = flattenTracks(tracksData);
    const audioTracks = flattened.filter((t) => t.type === 'audio');

    const host = c.req.header('host') || 'localhost:3000';
    const proto = c.req.header('x-forwarded-proto') || 'https';
    const rjCode = workData?.source_id || `RJ${resolved.numericId}`;

    let m3uContent = '#EXTM3U\n';
    if (workData?.title) {
      m3uContent += `#PLAYLIST:${workData.title}\n\n`;
    }

    for (const track of audioTracks) {
      const url = track.mediaStreamUrl || track.mediaDownloadUrl;
      if (!url) continue;
      const proxyUrl = `${proto}://${host}/api/download/file?url=${encodeURIComponent(url)}&name=${encodeURIComponent(track.title)}`;
      const duration = track.duration && track.duration > 0 ? Math.floor(track.duration) : -1;
      m3uContent += `#EXTINF:${duration},${track.title}\n${proxyUrl}\n\n`;
    }

    return new Response(m3uContent, {
      headers: {
        'Content-Type': 'audio/x-mpegurl; charset=utf-8',
        'Content-Disposition': `attachment; filename="${rjCode}_playlist.m3u"`,
      },
    });
  } catch (err: any) {
    return c.text('Failed generating playlist', 500);
  }
});

// 6. Batch Links (.TXT) Generator
app.get('/api/download/batch-links.txt', async (c) => {
  const inputId = c.req.query('id') || '';
  if (!inputId) {
    return c.text('Missing id parameter', 400);
  }

  try {
    const resolved = await resolveNumericWorkId(inputId);
    if (!resolved) {
      return c.text('Work not found', 404);
    }

    const tracksRes = await fetch(`https://api.asmr.one/api/tracks/${resolved.numericId}`, {
      headers: ASMR_API_HEADERS,
    });
    if (!tracksRes.ok) {
      return c.text('Could not fetch work tracks', tracksRes.status as any);
    }

    const tracksData: any = await tracksRes.json();
    const flattened = flattenTracks(tracksData);
    const host = c.req.header('host') || 'localhost:3000';
    const proto = c.req.header('x-forwarded-proto') || 'https';

    let txtContent = `# Batch Download Links for RJ${resolved.numericId}\n`;
    txtContent += `# Generated on ${new Date().toISOString()}\n\n`;

    for (const track of flattened) {
      const url = track.mediaDownloadUrl || track.mediaStreamUrl;
      if (!url) continue;
      const proxyUrl = `${proto}://${host}/api/download/file?url=${encodeURIComponent(url)}&name=${encodeURIComponent(track.title)}`;
      txtContent += `${proxyUrl}\n`;
    }

    return new Response(txtContent, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="RJ${resolved.numericId}_links.txt"`,
      },
    });
  } catch (err: any) {
    return c.text('Failed generating links', 500);
  }
});

// 7. Auto-generated cURL / Wget Bash Script (.SH)
app.get('/api/download/batch-script.sh', async (c) => {
  const inputId = c.req.query('id') || '';
  if (!inputId) {
    return c.text('Missing id parameter', 400);
  }

  try {
    const resolved = await resolveNumericWorkId(inputId);
    if (!resolved) {
      return c.text('Work not found', 404);
    }

    const tracksRes = await fetch(`https://api.asmr.one/api/tracks/${resolved.numericId}`, {
      headers: ASMR_API_HEADERS,
    });
    if (!tracksRes.ok) {
      return c.text('Could not fetch work tracks', tracksRes.status as any);
    }

    const tracksData: any = await tracksRes.json();
    const flattened = flattenTracks(tracksData);
    const host = c.req.header('host') || 'localhost:3000';
    const proto = c.req.header('x-forwarded-proto') || 'https';
    const rjCode = `RJ${resolved.numericId}`;

    let sh = `#!/bin/bash\n`;
    sh += `# Download Script for ${rjCode}\n`;
    sh += `echo "Starting download for ${rjCode}..."\n`;
    sh += `mkdir -p "${rjCode}"\n\n`;

    for (const track of flattened) {
      const url = track.mediaDownloadUrl || track.mediaStreamUrl;
      if (!url) continue;
      const proxyUrl = `${proto}://${host}/api/download/file?url=${encodeURIComponent(url)}&name=${encodeURIComponent(track.title)}`;
      const safePath = track.path.replace(/"/g, '\\"');
      sh += `mkdir -p "${rjCode}/$(dirname "${safePath}")"\n`;
      sh += `echo "Downloading: ${track.title}..."\n`;
      sh += `curl -C - -L -f --retry 3 -o "${rjCode}/${safePath}" "${proxyUrl}"\n\n`;
    }

    sh += `echo "All downloads completed successfully!"\n`;

    return new Response(sh, {
      headers: {
        'Content-Type': 'application/x-sh; charset=utf-8',
        'Content-Disposition': `attachment; filename="download_${rjCode}.sh"`,
      },
    });
  } catch (err: any) {
    return c.text('Failed generating script', 500);
  }
});

// ==========================================
// RETRO / OPERA MINI SSR ENGINE
// ==========================================

// Route: /classic (SSR Home)
app.get('/classic', async (c) => {
  const imgMode = c.req.query('img') || '1';
  const langMode = c.req.query('lang') || 'all';

  let popularHtml = '';
  try {
    let targetSearch = '';
    if (langMode === 'zh-hans' || langMode === 'zh') targetSearch = '中文';
    else if (langMode === 'zh-hant') targetSearch = '繁體';
    else if (langMode === 'en') targetSearch = 'ENG';
    else if (langMode === 'ko') targetSearch = '한국어';

    const popRes = await fetch(
      `https://api.asmr.one/api/search/${encodeURIComponent(targetSearch)}?order=dl_count&sort=desc&page=1`,
      { headers: ASMR_API_HEADERS }
    );
    if (popRes.ok) {
      const data: any = await popRes.json();
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
            Editions: ${edList
              .map(
                (ed: any) =>
                  `<a href="/classic/work/${ed.workno}?img=${imgMode}&lang=${langMode}">[${escapeHtml(
                    ed.label
                  )}: ${escapeHtml(ed.workno)}]</a>`
              )
              .join(' ')}
          </div>`;
        }

        popularHtml += `
          <div class="work-item">
            <span class="badge badge-rj">${escapeHtml(w.source_id || 'RJ' + w.id)}</span>
            <span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">${escapeHtml(
              langInfo.flag + ' ' + langInfo.label
            )}</span>
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
      &bull; <strong>Downloads:</strong> Click [Download] on any track to download directly to your memory card (E:\\).<br />
      &bull; <strong>RealPlayer Streaming:</strong> Click [RealPlayer M3U] to stream all audio tracks in sequence inside native Symbian RealPlayer or CorePlayer.<br />
      &bull; <strong>Language Filter:</strong> Switch language filter at top to find Japanese original or Chinese/English translated editions.<br />
      &bull; <strong>2G Data Saver:</strong> Click [No Img] in the top subnav to disable cover photos and save 98% mobile data.
    </div>

    ${popularHtml}
  `;

  return c.html(renderRetroPage('Home', content, '', imgMode, langMode));
});

// Route: /classic/search (SSR Search Results)
app.get('/classic/search', async (c) => {
  let query = c.req.query('q') || '';
  const page = parseInt(c.req.query('page') || '1', 10) || 1;
  const imgMode = c.req.query('img') || '1';
  const langMode = c.req.query('lang') || 'all';
  const order = c.req.query('order') || 'dl_count';
  const sort = c.req.query('sort') || 'desc';

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
      const data: any = await upstreamRes.json();
      let works = data.works || [];
      if (langMode !== 'all') {
        works = works.filter((w: any) => matchesLanguage(w, langMode));
      }
      const total = data.pagination?.totalCount || 0;
      const pageSize = data.pagination?.pageSize || 20;
      const totalPages = Math.ceil(total / pageSize) || 1;

      resultsHtml += `<div style="font-size:12px; margin-bottom: 8px;">
        Found <strong>${works.length}</strong> works on this page for "<strong>${escapeHtml(
        query || (langMode !== 'all' ? langMode.toUpperCase() : 'All')
      )}</strong>" (Page ${page} of ${totalPages} &bull; Lang: ${escapeHtml(langMode.toUpperCase())})
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
              Editions: ${edList
                .map(
                  (ed: any) =>
                    `<a href="/classic/work/${ed.workno}?img=${imgMode}&lang=${langMode}">[${escapeHtml(
                      ed.label
                    )}: ${escapeHtml(ed.workno)}]</a>`
                )
                .join(' ')}
            </div>`;
          }

          resultsHtml += `
            <div class="work-item">
              <span class="badge badge-rj">${escapeHtml(w.source_id || 'RJ' + w.id)}</span>
              <span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">${escapeHtml(
                langInfo.flag + ' ' + langInfo.label
              )}</span>
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

        paginationHtml = '<div class="pagination">';
        if (page > 1) {
          paginationHtml += `<a href="/classic/search?q=${encodeURIComponent(
            query
          )}&page=${page - 1}&img=${imgMode}&lang=${langMode}&order=${order}&sort=${sort}">&laquo; Previous Page</a> | `;
        }
        paginationHtml += `Page ${page} / ${totalPages}`;
        if (page < totalPages) {
          paginationHtml += ` | <a href="/classic/search?q=${encodeURIComponent(
            query
          )}&page=${page + 1}&img=${imgMode}&lang=${langMode}&order=${order}&sort=${sort}">Next Page &raquo;</a>`;
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
        <input type="text" name="q" value="${escapeHtml(
          query
        )}" placeholder="RJ code or keywords..." style="margin-bottom:4px;" /><br />
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

  return c.html(
    renderRetroPage(
      `Search: ${query || (langMode !== 'all' ? langMode.toUpperCase() : 'Popular')}`,
      content,
      query,
      imgMode,
      langMode
    )
  );
});

// Route: /classic/work/:id (SSR Work Details & Track List)
app.get('/classic/work/:id', async (c) => {
  const inputId = c.req.param('id');
  const imgMode = c.req.query('img') || '1';
  const langMode = c.req.query('lang') || 'all';

  try {
    const resolved = await resolveNumericWorkId(inputId);
    if (!resolved) {
      return c.html(renderRetroPage('Error', '<p style="color:red;">Work not found.</p>', '', imgMode));
    }

    const [workRes, tracksRes] = await Promise.all([
      fetch(`https://api.asmr.one/api/work/${resolved.numericId}`, { headers: ASMR_API_HEADERS }),
      fetch(`https://api.asmr.one/api/tracks/${resolved.numericId}`, { headers: ASMR_API_HEADERS }),
    ]);

    if (!tracksRes.ok) {
      return c.html(
        renderRetroPage(
          'Error',
          `<p style="color:red;">Failed to retrieve tracks for work ${resolved.numericId}.</p>`,
          '',
          imgMode
        )
      );
    }

    const workData: any = workRes.ok ? await workRes.json() : null;
    const tracksData: any = await tracksRes.json();

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
          <a href="${downloadProxyUrl}" class="btn btn-sm">[Download]</a>
          <a href="${downloadProxyUrl}" class="btn btn-green btn-sm">[Stream]</a>
        `;
      } else if (track.type === 'text') {
        typeBadge = `<span class="badge" style="background:#fef3c7; color:#92400e;">SCRIPT</span>`;
        actionsHtml = `
          <a href="/classic/text/${resolved.numericId}/${encodeURIComponent(
          track.hash || 'file'
        )}?url=${encodeURIComponent(url || '')}&img=${imgMode}" class="btn btn-sm">[Read Script]</a>
          <a href="${downloadProxyUrl}" class="btn btn-sm">[Save]</a>
        `;
      } else {
        actionsHtml = url ? `<a href="${downloadProxyUrl}" class="btn btn-sm">[Download]</a>` : 'N/A';
      }

      tracksTableHtml += `
        <tr>
          <td>${typeBadge}</td>
          <td><strong>${escapeHtml(track.path)}</strong></td>
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
              `<a href="/classic/work/${ed.workno}?img=${imgMode}&lang=${langMode}">[${escapeHtml(
                ed.label
              )}: ${escapeHtml(ed.workno)}]</a>`
          )
          .join(' ')}
      </div>`;
    }

    const content = `
      <div style="margin-bottom: 10px;">
        <span class="badge badge-rj">${escapeHtml(rjCode)}</span>
        <span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">${escapeHtml(
          langInfo.flag + ' ' + langInfo.label
        )}</span>
        <span class="badge badge-rating">&#9733; ${escapeHtml(String(workData?.rate_average_2dp || 'N/A'))}</span>
        <h2 style="font-size: 15px; margin: 4px 0;">${escapeHtml(title)}</h2>
        ${coverHtml}
        <div class="meta-tag">
          <strong>Language:</strong> ${escapeHtml(langInfo.flag + ' ' + langInfo.label)} | <strong>Circle:</strong> ${escapeHtml(
      circleName
    )} | <strong>CV:</strong> ${escapeHtml(vas)}<br />
          <strong>Release:</strong> ${escapeHtml(workData?.release || 'N/A')} | <strong>Price:</strong> &yen;${escapeHtml(
      String(workData?.price || 0)
    )}<br />
          <strong>Total Size:</strong> ${escapeHtml(formatBytes(totalSize))} | <strong>Tracks:</strong> ${
      audioTracks.length
    } audio, ${textTracks.length} text<br />
          <strong>Tags:</strong> ${escapeHtml(tags)}
        </div>
        ${editionsHtml}
      </div>

      <div class="search-box" style="background:#e0f2fe; border-color:#7dd3fc;">
        <strong>&#128229; Quick Actions:</strong><br />
        <div style="margin-top: 6px;">
          <a href="/api/download/playlist.m3u?id=${resolved.numericId}" class="btn btn-green">[Play in RealPlayer (.M3U)]</a>
          <a href="/api/download/batch-links.txt?id=${resolved.numericId}" class="btn">[Download Links (.TXT)]</a>
          <a href="/api/download/batch-script.sh?id=${resolved.numericId}" class="btn">[Curl / Wget Script]</a>
        </div>
      </div>

      <h3>Files &amp; Tracks (${flattened.length} items)</h3>
      ${tracksTableHtml}
      <div style="margin-top: 10px;">
        <a href="/classic/search?q=${encodeURIComponent(circleName)}&img=${imgMode}">&laquo; More from Circle: ${escapeHtml(
      circleName
    )}</a>
      </div>
    `;

    return c.html(renderRetroPage(title, content, rjCode, imgMode, langMode));
  } catch (err: any) {
    return c.html(
      renderRetroPage('Error', `<p style="color:red;">Error loading work: ${escapeHtml(err.message)}</p>`, '', imgMode)
    );
  }
});

// Route: /classic/text/:workId/:hash (SSR Plain Text Reader)
app.get('/classic/text/:workId/:hash', async (c) => {
  const workId = c.req.param('workId');
  const targetUrl = c.req.query('url');
  const imgMode = c.req.query('img') || '1';

  if (!targetUrl) {
    return c.html(renderRetroPage('Error', '<p style="color:red;">No text document URL provided.</p>', '', imgMode));
  }

  try {
    const textRes = await fetch(targetUrl, { headers: ASMR_API_HEADERS });
    if (!textRes.ok) {
      return c.html(
        renderRetroPage('Error', `<p style="color:red;">Failed to retrieve text (status ${textRes.status})</p>`, '', imgMode)
      );
    }

    const textContent = await textRes.text();
    const content = `
      <div style="margin-bottom: 8px;">
        <a href="/classic/work/${workId}?img=${imgMode}">&laquo; Back to Work Details</a>
      </div>
      <div style="background:#ffffff; border: 1px solid #cbd5e1; padding: 10px; font-family: monospace; font-size: 12px; white-space: pre-wrap; line-height: 1.5; color: #1e293b;">
        ${escapeHtml(textContent)}
      </div>
      <div style="margin-top: 8px;">
        <a href="/classic/work/${workId}?img=${imgMode}">&laquo; Back to Work Details</a>
      </div>
    `;

    return c.html(renderRetroPage(`Script Reader - RJ${workId}`, content, '', imgMode));
  } catch (err: any) {
    return c.html(
      renderRetroPage('Error', `<p style="color:red;">Error loading text document: ${escapeHtml(err.message)}</p>`, '', imgMode)
    );
  }
});

// ==========================================
// STATIC ASSET FALLBACK (CLOUDFLARE WORKERS)
// ==========================================
app.get('*', async (c) => {
  if (c.env?.ASSETS) {
    return await c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Not found', 404);
});

export default app;
