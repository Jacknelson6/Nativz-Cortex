import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Legacy /admin/onboarding flow roster — superseded by the unified
 * /admin/sales pipeline (spec: 2026-04-25-sales-pipeline-unification.md).
 *
 * The flow detail page (/admin/onboarding/[id]) stays as the canonical
 * surface for editing a single onboarding flow — every Sales row links
 * through to it. Only the index redirects.
 */
export default async function OnboardingIndex() {
  redirect('/admin/sales?status=onboarding');
}
