import {
  Activity,
  BookOpen,
  Cpu,
  Gauge,
  Key,
  TrendingUp,
} from 'lucide-react';
import type { SectionTabDef } from '@/components/admin/section-tabs';

// Icons are pre-rendered as elements (not component refs) so the tabs
// array is RSC-serializable when passed from a server page to the
// client-side SectionTabs component.
export const AI_SETTINGS_TABS = [
  { slug: 'overview',    label: 'Overview',    icon: <Activity size={13} /> },
  { slug: 'model',       label: 'Model',       icon: <Cpu size={13} /> },
  { slug: 'credentials', label: 'API key',     icon: <Key size={13} /> },
  { slug: 'skills',      label: 'Skills',      icon: <BookOpen size={13} /> },
  { slug: 'search-cost', label: 'Search cost', icon: <Gauge size={13} /> },
  { slug: 'usage',       label: 'Usage',       icon: <TrendingUp size={13} /> },
] as const satisfies readonly SectionTabDef[];

export type AiSettingsTabSlug = (typeof AI_SETTINGS_TABS)[number]['slug'];
export const AI_SETTINGS_TAB_SLUGS: readonly AiSettingsTabSlug[] = AI_SETTINGS_TABS.map((t) => t.slug);
