'use server';

import { revalidateTag } from 'next/cache';
import { ACCOUNTING_CACHE_TAG } from '@/components/admin/accounting/cache';
import { requireAdmin } from '@/lib/admin/require-admin';

export async function refreshAccounting() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  revalidateTag(ACCOUNTING_CACHE_TAG);
  return { ok: true } as const;
}
