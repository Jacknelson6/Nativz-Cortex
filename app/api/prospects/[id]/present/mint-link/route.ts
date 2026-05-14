// SPY-09 T08: POST /api/prospects/[id]/present/mint-link
//
// Snapshots the prospect's current presentation data into a share-link
// row (kind='presentation', 30-day expiry) and returns the public URL.
// Snapshot lives on metadata.presentation_snapshot so it survives later
// data edits — the public link always shows the agreed-upon view.

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLatestAnalysis } from '@/lib/prospects/analysis-queries';
import { computeScorecard } from '@/lib/prospects/checklist';
import { getLatestBenchmark } from '@/lib/prospects/benchmark-orchestrator';
import { buildPresentationSnapshot } from '@/lib/prospects/snapshot-presentation';
import { getBrandFromRequest } from '@/lib/agency/brand-from-request';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function requireAdmin(): Promise<
  | { ok: true; userId: string; email: string | null; fullName: string | null }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('users')
    .select('role, email, full_name')
    .eq('id', user.id)
    .single();
  if (!row || !['admin', 'super_admin'].includes(row.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return {
    ok: true,
    userId: user.id,
    email: row.email ?? user.email ?? null,
    fullName: row.full_name ?? null,
  };
}

function publicUrl(request: NextRequest, token: string): string {
  const baseUrl =
    request.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io';
  return `${baseUrl}/present/${token}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const admin = createAdminClient();

    const { data: prospect } = await admin
      .from('prospects')
      .select('id, brand_name, owner_user_id')
      .eq('id', id)
      .maybeSingle();
    if (!prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    const analysis = await getLatestAnalysis(id);
    if (!analysis) {
      return NextResponse.json(
        { error: 'No analysis available — run analysis first.' },
        { status: 422 },
      );
    }
    if (!analysis.thirty_day_plan) {
      return NextResponse.json(
        { error: 'No 30-day plan yet — draft one before minting the link.' },
        { status: 422 },
      );
    }

    const scorecard = computeScorecard(analysis);
    const benchmark = await getLatestBenchmark(id);

    const { brand } = getBrandFromRequest(request);
    const isAC = brand === 'anderson';
    const fallbackTeam = isAC ? 'Anderson Collaborative team' : 'Nativz team';
    const fallbackEmail = isAC ? 'hello@andersoncollaborative.com' : 'hello@nativz.io';

    // Owner contact: prospect.owner_user_id falls through to the minting
    // admin so unowned prospects still produce a usable contact panel.
    let contactName = auth.fullName ?? fallbackTeam;
    let contactEmail = auth.email ?? fallbackEmail;
    if (prospect.owner_user_id) {
      const { data: owner } = await admin
        .from('users')
        .select('full_name, email')
        .eq('id', prospect.owner_user_id)
        .maybeSingle();
      if (owner) {
        contactName = owner.full_name ?? contactName;
        contactEmail = owner.email ?? contactEmail;
      }
    }

    // SPY-01 stores the prospect's primary social avatar on prospect_socials.
    const { data: socials } = await admin
      .from('prospect_socials')
      .select('platform, avatar_url')
      .eq('prospect_id', id)
      .order('created_at', { ascending: true });
    const brandLogoUrl = socials?.[0]?.avatar_url ?? null;

    const snapshot = buildPresentationSnapshot({
      prospect: { brand_name: prospect.brand_name },
      brandLogoUrl,
      analysis,
      scorecard,
      benchmark: benchmark && (benchmark.status === 'succeeded' || benchmark.status === 'partial')
        ? benchmark
        : null,
      plan: analysis.thirty_day_plan,
      contact: { sales_rep_name: contactName, sales_rep_email: contactEmail },
    });

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: link, error: insertError } = await admin
      .from('prospect_share_links')
      .insert({
        prospect_id: id,
        analysis_id: analysis.id,
        token,
        kind: 'presentation',
        // Reuse the existing scorecard_snapshot column for the inner
        // scorecard so SPY-04 downstream consumers keep working.
        scorecard_snapshot: snapshot.current_state,
        metadata: { presentation_snapshot: snapshot },
        expires_at: expiresAt,
        created_by: auth.userId,
      })
      .select('id, token, expires_at, created_at')
      .single();

    if (insertError || !link) {
      return NextResponse.json(
        { error: insertError?.message ?? 'Failed to mint share link' },
        { status: 500 },
      );
    }

    await admin.from('prospect_touchpoints').insert({
      prospect_id: id,
      kind: 'note',
      body: 'Minted presentation link',
      metadata: { share_link_id: link.id, token, kind: 'presentation' },
      created_by: auth.userId,
    });

    return NextResponse.json({
      token,
      url: publicUrl(request, token),
      expires_at: link.expires_at,
      created_at: link.created_at,
    });
  } catch (err) {
    console.error('POST /api/prospects/[id]/present/mint-link error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
