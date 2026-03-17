// ── Types ───────────────────────────────────────────────────────────────────

export interface GeneratedIdea {
  title: string;
  why_it_works: string | string[];
  content_pillar: string;
  pillar_id?: string;
  script?: string;
  scriptLoading?: boolean;
  saved?: boolean;
  selected?: boolean;
  replacing?: boolean;
}

export interface Generation {
  id: string;
  client_id: string;
  concept: string | null;
  count: number;
  reference_video_ids: string[];
  search_id: string | null;
  source_url: string | null;
  ideas: GeneratedIdea[];
  status: string;
  error_message: string | null;
  tokens_used: number;
  estimated_cost: number;
  created_at: string;
  completed_at: string | null;
  pillar_ids?: string[] | null;
  ideas_per_pillar?: number | null;
}

export interface PillarInfo {
  id: string;
  name: string;
  emoji: string | null;
}

export interface IdeasResultsClientProps {
  generation: Generation;
  clientName: string;
  agency?: string | null;
  searchQuery: string | null;
  savedScripts?: Record<string, string>;
}

// ── CTA Options ─────────────────────────────────────────────────────────────

import { Ban, Phone, MousePointer, MessageCircle } from 'lucide-react';

export const CTA_PRESETS = [
  { value: '', label: 'No CTA', icon: Ban },
  { value: 'Call us today', label: 'Call', icon: Phone },
  { value: 'Click the link in bio', label: 'Click the link in bio', icon: MousePointer },
  { value: 'comment', label: 'Comment "[blank]"', icon: MessageCircle, isComment: true },
] as const;

export const HOOK_STRATEGIES = [
  { id: 'negative', label: 'Negative hook', example: '"Stop doing this...", "This is ruining your..."' },
  { id: 'curiosity', label: 'Curiosity gap', example: '"You won\'t believe...", "Here\'s what nobody tells you..."' },
  { id: 'controversial', label: 'Hot take', example: '"Unpopular opinion:", "I don\'t care what anyone says..."' },
  { id: 'story', label: 'Story-based', example: '"So this happened...", "I made a huge mistake..."' },
  { id: 'authority', label: 'Authority / proof', example: '"After 10 years in this industry...", "I tested this for 30 days..."' },
  { id: 'question', label: 'Direct question', example: '"Why are you still...?", "Did you know...?"' },
  { id: 'listicle', label: 'Listicle / number', example: '"3 things you need to know...", "The #1 reason..."' },
  { id: 'fomo', label: 'FOMO', example: '"Everyone is doing this except you", "You\'re losing money if..."' },
  { id: 'tutorial', label: 'Tutorial / how-to', example: '"Here\'s exactly how to...", "Watch me do..."' },
] as const;
