/**
 * POST /api/monday/sync
 *
 * Full sync: fetch all clients from Monday.com and update their
 * vault profiles. Preserves vault-owned fields (brand voice, audience, etc.)
 * while updating Monday.com-owned fields (services, POC, abbreviation).
 */

import { NextResponse } from 'next/server';
import { isVaultConfigured } from '@/lib/vault/github';
import { isMondayConfigured } from '@/lib/monday/client';
import { syncAllMondayClients } from '@/lib/monday/sync';

export const maxDuration = 60;

export async function POST() {
  try {
    if (!isVaultConfigured()) {
      return NextResponse.json({ error: 'Vault not configured' }, { status: 503 });
    }
    if (!isMondayConfigured()) {
      return NextResponse.json({ error: 'Monday.com not configured' }, { status: 503 });
    }

    const { results } = await syncAllMondayClients();

    const created = results.filter((r) => r.action === 'created').length;
    const updated = results.filter((r) => r.action === 'updated').length;
    const errors = results.filter((r) => r.action.startsWith('error')).length;

    return NextResponse.json({
      message: `Synced ${created + updated} clients: ${created} created, ${updated} updated, ${errors} errors`,
      results,
    });
  } catch (error) {
    console.error('POST /api/monday/sync error:', error);
    return NextResponse.json({ error: 'Failed to sync' }, { status: 500 });
  }
}
