import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { extractTikTokUsername } from '@/lib/audit/scrape-tiktok-profile';

export const maxDuration = 30;

const AddCompetitorSchema = z.object({
  client_id: z.string().uuid(),
  profile_url: z.string().min(1),
  platform: z.enum(['tiktok', 'instagram', 'facebook', 'youtube']).default('tiktok'),
});

/**
 * GET /api/analytics/competitors — List competitors for a client
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clientId = new URL(request.url).searchParams.get('client_id');
    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Fetch competitors with their latest snapshot
    const { data: competitors } = await adminClient
      .from('client_competitors')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    // Fetch latest snapshot for each competitor
    const competitorIds = (competitors ?? []).map(c => c.id);
    const { data: snapshots } = competitorIds.length > 0
      ? await adminClient
          .from('competitor_snapshots')
          .select('*')
          .in('competitor_id', competitorIds)
          .order('scraped_at', { ascending: false })
      : { data: [] };

    // Group snapshots by competitor, most recent first
    type SnapshotRow = NonNullable<typeof snapshots>[number];
    const snapshotMap: Record<string, SnapshotRow[]> = {};
    for (const s of snapshots ?? []) {
      if (!snapshotMap[s.competitor_id]) snapshotMap[s.competitor_id] = [];
      snapshotMap[s.competitor_id].push(s);
    }

    const enriched = (competitors ?? []).map(c => ({
      ...c,
      latestSnapshot: snapshotMap[c.id]?.[0] ?? null,
      snapshots: snapshotMap[c.id] ?? [],
    }));

    return NextResponse.json({ competitors: enriched });
  } catch (error) {
    console.error('GET /api/analytics/competitors error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/analytics/competitors — Add a competitor
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = AddCompetitorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Extract username from URL
    const username = extractTikTokUsername(parsed.data.profile_url);
    if (!username) {
      return NextResponse.json({ error: 'Could not extract username from the URL' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Check for duplicates
    const { data: existing } = await adminClient
      .from('client_competitors')
      .select('id')
      .eq('client_id', parsed.data.client_id)
      .eq('username', username)
      .eq('platform', parsed.data.platform)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'This competitor is already being tracked' }, { status: 409 });
    }

    const { data: competitor, error } = await adminClient
      .from('client_competitors')
      .insert({
        client_id: parsed.data.client_id,
        platform: parsed.data.platform,
        profile_url: parsed.data.profile_url,
        username,
        added_by: user.id,
      })
      .select()
      .single();

    if (error || !competitor) {
      console.error('Add competitor error:', error);
      return NextResponse.json({ error: 'Failed to add competitor' }, { status: 500 });
    }

    return NextResponse.json({ competitor });
  } catch (error) {
    console.error('POST /api/analytics/competitors error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/analytics/competitors — Remove a competitor
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const competitorId = new URL(request.url).searchParams.get('id');
    if (!competitorId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    await adminClient
      .from('client_competitors')
      .delete()
      .eq('id', competitorId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/analytics/competitors error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
