import { Activity, Building2, LayoutGrid } from 'lucide-react';
import type { SectionTabDef } from '@/components/admin/section-tabs';

export const CLIENTS_TABS = [
  { slug: 'overview', label: 'Overview',    icon: Activity },
  { slug: 'roster',   label: 'All clients', icon: Building2 },
  { slug: 'groups',   label: 'Groups',      icon: LayoutGrid },
] as const satisfies readonly SectionTabDef[];

export type ClientsTabSlug = (typeof CLIENTS_TABS)[number]['slug'];
export const CLIENTS_TAB_SLUGS: readonly ClientsTabSlug[] = CLIENTS_TABS.map((t) => t.slug);
