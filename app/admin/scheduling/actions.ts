'use server';

import { revalidateTag } from 'next/cache';
import { CALENDAR_EVENTS_CACHE_TAG } from '@/lib/scheduling/calendar-cache';
import { requireAdmin } from '@/lib/admin/require-admin';

export async function refreshScheduling() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  revalidateTag(CALENDAR_EVENTS_CACHE_TAG);
  return { ok: true } as const;
}
