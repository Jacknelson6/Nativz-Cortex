import { Activity, CalendarDays, BarChart3 } from 'lucide-react';
import type { SectionTabDef } from '@/components/admin/section-tabs';

export const ACCOUNTING_TABS = [
  { slug: 'overview', label: 'Overview',  icon: <Activity size={13} /> },
  { slug: 'periods',  label: 'Periods',   icon: <CalendarDays size={13} /> },
  { slug: 'year',     label: 'Year view', icon: <BarChart3 size={13} /> },
] as const satisfies readonly SectionTabDef[];

export type AccountingTabSlug = (typeof ACCOUNTING_TABS)[number]['slug'];
export const ACCOUNTING_TAB_SLUGS: readonly AccountingTabSlug[] = ACCOUNTING_TABS.map((t) => t.slug);
