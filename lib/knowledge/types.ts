export type KnowledgeEntryType = 'brand_asset' | 'brand_profile' | 'document' | 'web_page' | 'note' | 'idea' | 'meeting_note';
export type KnowledgeSource = 'manual' | 'scraped' | 'generated' | 'imported';
export type KnowledgeNodeType = 'entry' | 'contact' | 'search' | 'strategy' | 'idea_submission';

export interface KnowledgeEntry {
  id: string;
  client_id: string;
  type: KnowledgeEntryType;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  source: KnowledgeSource;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface KnowledgeLink {
  id: string;
  client_id: string;
  source_id: string;
  source_type: KnowledgeNodeType;
  target_id: string;
  target_type: KnowledgeNodeType;
  label: string;
  created_at: string;
}

export interface KnowledgeGraphData {
  entries: KnowledgeEntry[];
  links: KnowledgeLink[];
  externalNodes: ExternalNode[];
}

export interface ExternalNode {
  id: string;
  type: KnowledgeNodeType;
  title: string;
  subtitle: string;
  created_at: string;
}

// Metadata shapes per entry type
export interface BrandAssetMetadata {
  colors?: string[];
  fonts?: string[];
  file_url?: string;
  asset_type?: 'logo' | 'color_palette' | 'font' | 'style_guide' | 'other';
}

export interface WebPageMetadata {
  source_url: string;
  scraped_at: string;
  depth: number;
  word_count: number;
  status?: 'processing' | 'completed' | 'failed';
}

export interface BrandProfileMetadata {
  generated_from: string[];
  superseded_by?: string;
  colors?: string[];
  fonts?: string[];
}

export interface IdeaMetadata {
  format?: 'short_form' | 'long_form' | 'reel' | 'story';
  content_pillar?: string;
  concept_input?: string;
}

export interface MeetingNoteMetadata {
  meeting_date?: string;
  attendees?: string[];
  action_items?: string[];
  source?: 'fyxer' | 'manual' | 'other';
}
