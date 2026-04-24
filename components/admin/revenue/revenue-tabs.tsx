import { Activity, CreditCard, Repeat, Users, Megaphone, Clock3 } from 'lucide-react';
import type { SectionTabDef } from '@/components/admin/section-tabs';

export const REVENUE_TABS = [
  { slug: 'overview',      label: 'Overview',      icon: <Activity size={13} /> },
  { slug: 'invoices',      label: 'Invoices',      icon: <CreditCard size={13} /> },
  { slug: 'subscriptions', label: 'Subscriptions', icon: <Repeat size={13} /> },
  { slug: 'clients',       label: 'Clients',       icon: <Users size={13} /> },
  { slug: 'ad-spend',      label: 'Ad spend',      icon: <Megaphone size={13} /> },
  { slug: 'activity',      label: 'Activity',      icon: <Clock3 size={13} /> },
] as const satisfies readonly SectionTabDef[];

export type RevenueTabSlug = (typeof REVENUE_TABS)[number]['slug'];
export const REVENUE_TAB_SLUGS: readonly RevenueTabSlug[] = REVENUE_TABS.map((t) => t.slug);
