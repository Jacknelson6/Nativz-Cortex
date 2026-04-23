import { Activity, ClipboardList, LayoutTemplate, Mail } from 'lucide-react';
import type { SectionTabDef } from '@/components/admin/section-tabs';

export const ONBOARDING_TABS = [
  { slug: 'overview',        label: 'Overview',        icon: Activity },
  { slug: 'trackers',        label: 'Trackers',        icon: ClipboardList },
  { slug: 'templates',       label: 'Templates',       icon: LayoutTemplate },
  { slug: 'email-templates', label: 'Email templates', icon: Mail },
] as const satisfies readonly SectionTabDef[];

export type OnboardingTabSlug = (typeof ONBOARDING_TABS)[number]['slug'];
export const ONBOARDING_TAB_SLUGS: readonly OnboardingTabSlug[] = ONBOARDING_TABS.map((t) => t.slug);
