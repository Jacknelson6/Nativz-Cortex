import { Bell, Sliders, Sparkles } from 'lucide-react';
import type { SectionTabDef } from '@/components/admin/section-tabs';

// Icons are pre-rendered as elements (not component refs) so the tabs
// array is RSC-serializable when passed from a server page to the
// client-side SectionTabs component.
export const AI_SETTINGS_TABS = [
  { slug: 'ai',            label: 'AI',            icon: <Sparkles size={13} /> },
  { slug: 'notifications', label: 'Notifications', icon: <Bell size={13} /> },
  { slug: 'trend-finder',  label: 'Trend finder',  icon: <Sliders size={13} /> },
] as const satisfies readonly SectionTabDef[];

export type AiSettingsTabSlug = (typeof AI_SETTINGS_TABS)[number]['slug'];
export const AI_SETTINGS_TAB_SLUGS: readonly AiSettingsTabSlug[] = AI_SETTINGS_TABS.map((t) => t.slug);
