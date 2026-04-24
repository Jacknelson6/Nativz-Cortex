import { BookOpen, Cpu, Key, Sliders } from 'lucide-react';
import type { SectionTabDef } from '@/components/admin/section-tabs';

// Icons are pre-rendered as elements (not component refs) so the tabs
// array is RSC-serializable when passed from a server page to the
// client-side SectionTabs component.
//
// Overview, Search cost, and Usage tabs moved to /admin/usage. Trend
// finder (scraper volume knobs) moved here on 2026-04-24 — it configures
// Cortex behavior alongside Model / API key / Skills, and doesn't belong
// next to usage rollups.
export const AI_SETTINGS_TABS = [
  { slug: 'model',        label: 'Model',        icon: <Cpu size={13} /> },
  { slug: 'credentials',  label: 'API key',      icon: <Key size={13} /> },
  { slug: 'skills',       label: 'Skills',       icon: <BookOpen size={13} /> },
  { slug: 'trend-finder', label: 'Trend finder', icon: <Sliders size={13} /> },
] as const satisfies readonly SectionTabDef[];

export type AiSettingsTabSlug = (typeof AI_SETTINGS_TABS)[number]['slug'];
export const AI_SETTINGS_TAB_SLUGS: readonly AiSettingsTabSlug[] = AI_SETTINGS_TABS.map((t) => t.slug);
