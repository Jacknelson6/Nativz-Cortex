'use server';

import { revalidateTag } from 'next/cache';
import { AI_SETTINGS_CACHE_TAG } from '@/components/admin/ai-settings/cache';
import { requireAdmin } from '@/lib/admin/require-admin';

export async function refreshAiSettings() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  revalidateTag(AI_SETTINGS_CACHE_TAG);
  return { ok: true } as const;
}
