import { Activity, ClipboardList, LayoutTemplate, Mail } from 'lucide-react';
import type { SectionTabDef } from '@/components/admin/section-tabs';

export const ONBOARDING_TABS = [
  { slug: 'overview',        label: 'Overview',        icon: <Activity size={13} /> },
  { slug: 'trackers',        label: 'Trackers',        icon: <ClipboardList size={13} /> },
  { slug: 'templates',       label: 'Templates',       icon: <LayoutTemplate size={13} /> },
  { slug: 'email-templates', label: 'Email templates', icon: <Mail size={13} /> },
] as const satisfies readonly SectionTabDef[];

export type OnboardingTabSlug = (typeof ONBOARDING_TABS)[number]['slug'];
export const ONBOARDING_TAB_SLUGS: readonly OnboardingTabSlug[] = ONBOARDING_TABS.map((t) => t.slug);
