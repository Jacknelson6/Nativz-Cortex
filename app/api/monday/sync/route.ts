/**
 * POST /api/monday/sync
 *
 * Full sync: fetch all clients from Monday.com and update their
 * vault profiles. Preserves vault-owned fields (brand voice, audience, etc.)
 * while updating Monday.com-owned fields (services, POC, abbreviation).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isVaultConfigured } from '@/lib/vault/github';
import { isMondayConfigured, fetchMondayClients, parseMondayClient } from '@/lib/monday/client';
import { syncAllMondayClients } from '@/lib/monday/sync';

export const maxDuration = 60;

/**
 * GET /api/monday/sync?client_name=...
 *
 * Fetch a single client's Monday.com data by matching on name.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const clientName = request.nextUrl.searchParams.get('client_name');
    if (!clientName) {
      return NextResponse.json({ error: 'client_name is required' }, { status: 400 });
    }

    if (!isMondayConfigured()) {
      return NextResponse.json({ error: 'Monday.com not configured' }, { status: 503 });
    }

    const items = await fetchMondayClients();
    const match = items.find(
      (item) => item.name.toLowerCase() === clientName.toLowerCase(),
    );

    if (!match) {
      return NextResponse.json({ error: 'Not found in Monday.com' }, { status: 404 });
    }

    const parsed = parseMondayClient(match);
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('GET /api/monday/sync error:', error);
    return NextResponse.json({ error: 'Failed to fetch Monday.com data' }, { status: 500 });
  }
}

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
