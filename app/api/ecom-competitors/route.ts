import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

const AddSchema = z.object({
  client_id: z.string().uuid(),
  domain: z
    .string()
    .min(3)
    .max(253)
    .transform((s) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')),
  platform: z.enum(['shopify', 'woo', 'magento', 'bigcommerce', 'other']).default('other'),
  display_name: z.string().max(120).optional(),
});

/**
 * GET /api/ecom-competitors?client_id=… — list competitors + latest snapshot.
 *
 * @auth Required (admin)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const clientId = new URL(request.url).searchParams.get('client_id');
    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).single();
    if (!userRow || (userRow.role !== 'admin' && userRow.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data: competitors } = await admin
      .from('ecom_competitors')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    const ids = (competitors ?? []).map((c) => c.id);
    const { data: snapshots } = ids.length
      ? await admin
          .from('ecom_snapshots')
          .select('*')
          .in('ecom_competitor_id', ids)
          .order('scraped_at', { ascending: false })
      : { data: [] };

    type Snap = NonNullable<typeof snapshots>[number];
    const byCompetitor: Record<string, Snap[]> = {};
    for (const s of snapshots ?? []) {
      (byCompetitor[s.ecom_competitor_id] ??= []).push(s);
    }

    const enriched = (competitors ?? []).map((c) => ({
      ...c,
      latest_snapshot: byCompetitor[c.id]?.[0] ?? null,
    }));

    return NextResponse.json({ competitors: enriched });
  } catch (error) {
    console.error('GET /api/ecom-competitors error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/ecom-competitors — add a new ecom competitor.
 *
 * @auth Required (admin)
 * @body client_id, domain, platform?, display_name?
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = AddSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).single();
    if (!userRow || (userRow.role !== 'admin' && userRow.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data, error } = await admin
      .from('ecom_competitors')
      .insert({
        client_id: parsed.data.client_id,
        domain: parsed.data.domain,
        platform: parsed.data.platform,
        display_name: parsed.data.display_name ?? null,
        added_by: user.id,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'This domain is already tracked for this client' },
          { status: 409 },
        );
      }
      console.error('ecom_competitors insert error:', error);
      return NextResponse.json({ error: 'Failed to add competitor' }, { status: 500 });
    }

    return NextResponse.json({ competitor: data }, { status: 201 });
  } catch (error) {
    console.error('POST /api/ecom-competitors error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/ecom-competitors?id=… — remove one competitor (cascades to snapshots).
 *
 * @auth Required (admin)
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const admin = createAdminClient();
    const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).single();
    if (!userRow || (userRow.role !== 'admin' && userRow.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { error } = await admin.from('ecom_competitors').delete().eq('id', id);
    if (error) {
      console.error('ecom_competitors delete error:', error);
      return NextResponse.json({ error: 'Failed to delete competitor' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/ecom-competitors error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
