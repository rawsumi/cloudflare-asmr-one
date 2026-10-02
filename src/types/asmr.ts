export interface LanguageEdition {
  lang: string;
  label: string;
  workno: string;
  edition_id?: number;
  edition_type?: string;
  display_order?: number;
}

export interface WorkItem {
  id: number;
  source_id?: string;
  source_type?: string;
  source_url?: string;
  title: string;
  circle_id?: number;
  name?: string; // circle name
  nsfw?: boolean;
  release?: string;
  dl_count?: number;
  price?: number;
  review_count?: number;
  rate_count?: number;
  rate_average_2dp?: number;
  has_subtitle?: boolean;
  create_date?: string;
  duration?: number;
  vas?: Array<{ id: string; name: string }>;
  tags?: Array<{ id?: number; name: string }>;
  samCoverUrl?: string;
  thumbnailCoverUrl?: string;
  mainCoverUrl?: string;
  age_category_string?: string;
  userRating?: number;
  review_text?: string;
  language_editions?: LanguageEdition[];
  work_attributes?: string;
  translation_info?: {
    lang?: string | null;
    is_original?: boolean;
    is_child?: boolean;
    is_parent?: boolean;
    original_workno?: string | null;
    child_worknos?: string[];
  };
}

export interface Pagination {
  currentPage: number;
  pageSize: number;
  totalCount: number;
}

export interface SearchResponse {
  works: WorkItem[];
  pagination: Pagination;
}

export type TrackItemType = 'folder' | 'audio' | 'text' | 'image' | 'other';

export interface TrackItem {
  type: TrackItemType;
  title: string;
  hash?: string;
  size?: number;
  duration?: number;
  mediaStreamUrl?: string;
  mediaDownloadUrl?: string;
  streamLowQualityUrl?: string;
  work?: {
    id: number;
    source_id?: string;
    source_type?: string;
  };
  workTitle?: string;
  children?: TrackItem[];
}

export interface FlatTrack {
  id: string; // hash or generated id
  title: string;
  type: TrackItemType;
  size?: number;
  duration?: number;
  streamUrl: string;
  downloadUrl: string;
  path: string; // e.g. "01_Voice/track1.mp3"
  workId: number;
  workTitle?: string;
}

export interface WorkDetail extends WorkItem {
  tracks?: TrackItem[];
}
