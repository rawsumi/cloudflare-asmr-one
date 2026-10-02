import { WorkItem, SearchResponse, TrackItem, FlatTrack, WorkDetail } from '../types/asmr';

export interface SupportedLanguage {
  id: string;
  label: string;
  flag: string;
  short: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { id: 'all', label: 'All Languages', flag: '🌐', short: 'All' },
  { id: 'ja', label: 'Japanese (日本語)', flag: '🇯🇵', short: 'JPN' },
  { id: 'zh-hans', label: 'Simplified Chinese (简体中文)', flag: '🇨🇳', short: '简中' },
  { id: 'zh-hant', label: 'Traditional Chinese (繁體中文)', flag: '🇹🇼', short: '繁中' },
  { id: 'en', label: 'English (ENG)', flag: '🇬🇧', short: 'ENG' },
  { id: 'ko', label: 'Korean (한국어)', flag: '🇰🇷', short: 'KO' },
];

export async function searchWorks(
  query: string = '',
  page: number = 1,
  order: string = 'dl_count',
  sort: string = 'desc',
  subtitle?: boolean,
  lang: string = 'all'
): Promise<SearchResponse> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  params.set('page', page.toString());
  params.set('order', order);
  params.set('sort', sort);
  if (subtitle !== undefined) {
    params.set('subtitle', subtitle ? '1' : '0');
  }
  if (lang && lang !== 'all') {
    params.set('lang', lang);
  }

  const res = await fetch(`/api/search?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Search failed with status ${res.status}`);
  }
  return res.json();
}

export interface WorkLanguageInfo {
  primary: {
    code: string;
    label: string;
    flag: string;
    badgeClass: string;
  };
  hasMultipleEditions: boolean;
  editions: Array<{
    lang: string;
    label: string;
    workno: string;
  }>;
}

export function getWorkLanguageInfo(work: WorkItem): WorkLanguageInfo {
  const attrs = (work.work_attributes || '').toUpperCase();
  const transLang = (work.translation_info?.lang || '').toUpperCase();
  const editions: any[] = Array.isArray(work.language_editions)
    ? work.language_editions
    : typeof work.language_editions === 'object' && work.language_editions
    ? Object.values(work.language_editions)
    : [];

  let primary = {
    code: 'ja',
    label: '日本語',
    flag: '🇯🇵',
    badgeClass: 'bg-red-500/20 text-red-300 border-red-500/30',
  };

  if (attrs.includes('CHI_HANS') || transLang.includes('CHI_HANS') || /【简体中文版】|【汉化】/i.test(work.title)) {
    primary = {
      code: 'zh-hans',
      label: '简中',
      flag: '🇨🇳',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    };
  } else if (attrs.includes('CHI_HANT') || transLang.includes('CHI_HANT') || /【繁體中文版】/i.test(work.title)) {
    primary = {
      code: 'zh-hant',
      label: '繁中',
      flag: '🇹🇼',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    };
  } else if (attrs.includes('ENG') || transLang.includes('ENG') || /【English】/i.test(work.title)) {
    primary = {
      code: 'en',
      label: 'ENG',
      flag: '🇬🇧',
      badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    };
  } else if (attrs.includes('KO_KR') || transLang.includes('KO_KR')) {
    primary = {
      code: 'ko',
      label: '한국어',
      flag: '🇰🇷',
      badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    };
  }

  return {
    primary,
    hasMultipleEditions: editions.length > 0,
    editions,
  };
}

export async function getWorkDetails(idOrRj: string | number): Promise<WorkItem> {
  const res = await fetch(`/api/work/${encodeURIComponent(idOrRj)}`);
  if (!res.ok) {
    throw new Error(`Failed to load work details (${res.status})`);
  }
  return res.json();
}

export async function getWorkTracks(idOrRj: string | number): Promise<TrackItem[]> {
  const res = await fetch(`/api/tracks/${encodeURIComponent(idOrRj)}`);
  if (!res.ok) {
    throw new Error(`Failed to load tracks (${res.status})`);
  }
  return res.json();
}

export function flattenTrackTree(
  items: TrackItem[],
  workId: number,
  workTitle?: string,
  parentPath: string = ''
): FlatTrack[] {
  let flat: FlatTrack[] = [];
  for (const item of items) {
    const currentPath = parentPath ? `${parentPath}/${item.title}` : item.title;
    if (item.type === 'folder' && item.children) {
      flat = flat.concat(flattenTrackTree(item.children, workId, workTitle, currentPath));
    } else {
      flat.push({
        id: item.hash || `${workId}_${currentPath}`,
        title: item.title,
        type: item.type,
        size: item.size,
        duration: item.duration,
        streamUrl: item.mediaStreamUrl || '',
        downloadUrl: item.mediaDownloadUrl || item.mediaStreamUrl || '',
        path: currentPath,
        workId,
        workTitle,
      });
    }
  }
  return flat;
}

export function getDownloadProxyUrl(targetUrl: string, filename: string): string {
  return `/api/download/file?url=${encodeURIComponent(targetUrl)}&name=${encodeURIComponent(filename)}`;
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
