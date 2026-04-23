'use server';

import { revalidateTag } from 'next/cache';
import { ONBOARDING_CACHE_TAG } from '@/components/admin/onboarding/cache';
import { requireAdmin } from '@/lib/admin/require-admin';

export async function refreshOnboarding() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  revalidateTag(ONBOARDING_CACHE_TAG);
  return { ok: true } as const;
}
