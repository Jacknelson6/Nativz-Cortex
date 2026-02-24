export type MoodboardItemType = 'video' | 'image' | 'website';
export type MoodboardItemStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type MoodboardPlatform = 'tiktok' | 'instagram' | 'youtube' | 'twitter' | null;
export type StickyNoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'white';

export interface VideoStats {
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface MoodboardBoard {
  id: string;
  name: string;
  description: string | null;
  client_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined fields
  client_name?: string;
  item_count?: number;
}

export interface VideoPacing {
  description: string;
  estimated_cuts: number;
  cuts_per_minute: number;
}

export interface VideoPacingDetail {
  description: string;
  estimated_cuts: number;
  cuts_per_minute: number;
  scenes: Array<{ timestamp: number; description: string }>;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface MusicAnalysis {
  type: string;
  mood: string;
  name: string | null;
}

export interface CaptionOverlayDetail {
  timestamp: number;
  text: string;
  style: string;
}

export interface VideoFrame {
  url: string;
  timestamp: number;
  label: string;
}

export interface PageInsights {
  summary: string;
  key_headlines: string[];
  value_propositions: string[];
  design_notes: string;
  notable_insights: string[];
  content_themes: string[];
}

export interface VideoAnalysis {
  hook: string;
  hook_analysis: string;
  hook_score: number;
  hook_type: string;
  cta: string;
  concept_summary: string;
  pacing: VideoPacingDetail;
  caption_overlays: CaptionOverlayDetail[];
  content_themes: string[];
  winning_elements: string[];
  improvement_areas: string[];
  music_analysis: MusicAnalysis | null;
}

export interface MoodboardItem {
  id: string;
  board_id: string;
  type: MoodboardItemType;
  url: string;
  title: string | null;
  thumbnail_url: string | null;
  status: MoodboardItemStatus;

  // video fields
  duration: number | null;
  transcript: string | null;
  transcript_segments: TranscriptSegment[];
  hook: string | null;
  hook_analysis: string | null;
  hook_score: number | null;
  hook_type: string | null;
  cta: string | null;
  concept_summary: string | null;
  pacing: VideoPacing | null;
  pacing_detail: VideoPacingDetail | null;
  frames: VideoFrame[];
  caption_overlays: CaptionOverlayDetail[];
  content_themes: string[];
  winning_elements: string[];
  improvement_areas: string[];
  replication_brief: string | null;
  platform: string | null;
  author_name: string | null;
  author_handle: string | null;
  stats: { views: number; likes: number; comments: number; shares: number } | null;
  music: string | null;
  hashtags: string[];
  error_message: string | null;

  // website fields
  screenshot_url: string | null;
  page_insights: PageInsights | null;

  // canvas positioning
  position_x: number;
  position_y: number;
  width: number;
  height: number;

  // meta
  client_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MoodboardNote {
  id: string;
  board_id: string;
  content: string;
  color: StickyNoteColor;
  position_x: number;
  position_y: number;
  width: number;
  created_by: string | null;
  created_at: string;
}

export interface MoodboardComment {
  id: string;
  item_id: string;
  user_id: string;
  content: string;
  video_timestamp: number | null;
  created_at: string;
  updated_at: string;
  // joined
  user_name?: string;
  user_avatar?: string | null;
}

export interface MoodboardEdge {
  id: string;
  board_id: string;
  source_node_id: string;
  target_node_id: string;
  label: string | null;
  style: 'solid' | 'dashed' | 'dotted';
  color: string;
  created_by: string | null;
  created_at: string;
}

// URL detection
export type DetectedLinkType = 'youtube' | 'tiktok' | 'instagram' | 'twitter' | 'direct_video' | 'image' | 'website';

export function detectLinkType(url: string): DetectedLinkType {
  const lower = url.toLowerCase();

  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('instagram.com/reel') || lower.includes('instagram.com/p/')) return 'instagram';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'twitter';
  if (/\.(mp4|mov|webm)(\?|$)/i.test(lower)) return 'direct_video';
  if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(lower)) return 'image';

  return 'website';
}

export function linkTypeToItemType(linkType: DetectedLinkType): MoodboardItemType {
  switch (linkType) {
    case 'youtube':
    case 'tiktok':
    case 'instagram':
    case 'twitter':
    case 'direct_video':
      return 'video';
    case 'image':
      return 'image';
    case 'website':
      return 'website';
  }
}
