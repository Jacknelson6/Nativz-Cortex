import { CalendarDays } from 'lucide-react';
import type { SectionTabDef } from '@/components/admin/section-tabs';

export const ACCOUNTING_TABS = [
  { slug: 'periods', label: 'Periods', icon: <CalendarDays size={13} /> },
] as const satisfies readonly SectionTabDef[];

export type AccountingTabSlug = (typeof ACCOUNTING_TABS)[number]['slug'];
export const ACCOUNTING_TAB_SLUGS: readonly AccountingTabSlug[] = ACCOUNTING_TABS.map((t) => t.slug);
