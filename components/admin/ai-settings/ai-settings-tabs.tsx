import {
  Activity,
  BookOpen,
  Cpu,
  Gauge,
  Key,
  TrendingUp,
} from 'lucide-react';
import type { SectionTabDef } from '@/components/admin/section-tabs';

export const AI_SETTINGS_TABS = [
  { slug: 'overview',      label: 'Overview',       icon: Activity },
  { slug: 'model',         label: 'Model',          icon: Cpu },
  { slug: 'credentials',   label: 'API key',        icon: Key },
  { slug: 'skills',        label: 'Skills',         icon: BookOpen },
  { slug: 'search-cost',   label: 'Search cost',    icon: Gauge },
  { slug: 'usage',         label: 'Usage',          icon: TrendingUp },
] as const satisfies readonly SectionTabDef[];

export type AiSettingsTabSlug = (typeof AI_SETTINGS_TABS)[number]['slug'];
export const AI_SETTINGS_TAB_SLUGS: readonly AiSettingsTabSlug[] = AI_SETTINGS_TABS.map((t) => t.slug);
