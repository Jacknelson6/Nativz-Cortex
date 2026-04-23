import { Activity, CalendarDays, BarChart3 } from 'lucide-react';
import type { SectionTabDef } from '@/components/admin/section-tabs';

export const ACCOUNTING_TABS = [
  { slug: 'overview', label: 'Overview', icon: Activity },
  { slug: 'periods',  label: 'Periods',  icon: CalendarDays },
  { slug: 'year',     label: 'Year view', icon: BarChart3 },
] as const satisfies readonly SectionTabDef[];

export type AccountingTabSlug = (typeof ACCOUNTING_TABS)[number]['slug'];
export const ACCOUNTING_TAB_SLUGS: readonly AccountingTabSlug[] = ACCOUNTING_TABS.map((t) => t.slug);
