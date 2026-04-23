'use server';

import { revalidateTag } from 'next/cache';
import { CLIENTS_CACHE_TAG } from '@/components/admin/clients/cache';
import { requireAdmin } from '@/lib/admin/require-admin';

export async function refreshClients() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  revalidateTag(CLIENTS_CACHE_TAG);
  return { ok: true } as const;
}
