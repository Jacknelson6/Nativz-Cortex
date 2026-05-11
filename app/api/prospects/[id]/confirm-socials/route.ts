// SPY-02 T08: POST /api/prospects/[id]/confirm-socials
//
// Persists the user-confirmed socials, patches primary_platform/handle,
// writes a state_change touchpoint, and fires SPY-03's initial analysis
// in the background (don't await — keep the response fast). Idempotent
// via delete-then-upsert; safe to call multiple times.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/prospects/auth';
import { runInitialAnalysis } from '@/lib/prospects/initial-analysis';
import type { ProspectRow, ProspectSocialRow } from '@/lib/prospects/types';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const PLATFORM = z.enum(['tiktok', 'instagram', 'youtube', 'facebook']);

const RequestSchema = z.object({
  primary_platform: PLATFORM.nullable(),
  primary_handle: z.string().min(1).max(120).nullable(),
  socials: z
    .array(
      z.object({
        platform: PLATFORM,
        handle: z.string().min(1).max(120),
        profile_url: z.string().url().nullable().optional(),
        display_name: z.string().max(200).nullable().optional(),
      }),
    )
    .max(8),
  trigger_analysis: z.boolean().default(true),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { admin } = auth;
  const { data: existing, error: lookupErr } = await admin
    .from('prospects')
    .select('id, primary_platform, primary_handle')
    .eq('id', id)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
  }

  // Delete-then-upsert pattern keeps the call idempotent: the user can
  // hit Save twice without producing duplicate (prospect_id, platform)
  // rows (the SPY-01 unique index would reject the second batch anyway,
  // so we wipe first to make the second call succeed).
  const { error: delErr } = await admin.from('prospect_socials').delete().eq('prospect_id', id);
  if (delErr) {
    return NextResponse.json({ error: `Socials reset failed: ${delErr.message}` }, { status: 500 });
  }

  let socials: ProspectSocialRow[] = [];
  if (parsed.data.socials.length > 0) {
    const insertPayload = parsed.data.socials.map((s) => ({
      prospect_id: id,
      platform: s.platform,
      handle: s.handle,
      profile_url: s.profile_url ?? null,
      display_name: s.display_name ?? null,
    }));
    const { data: inserted, error: insertErr } = await admin
      .from('prospect_socials')
      .insert(insertPayload)
      .select('*');
    if (insertErr) {
      return NextResponse.json(
        { error: `Socials upsert failed: ${insertErr.message}` },
        { status: 500 },
      );
    }
    socials = (inserted ?? []) as ProspectSocialRow[];
  }

  const { data: patched, error: patchErr } = await admin
    .from('prospects')
    .update({
      primary_platform: parsed.data.primary_platform,
      primary_handle: parsed.data.primary_handle,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (patchErr || !patched) {
    return NextResponse.json(
      { error: `Primary patch failed: ${patchErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  void admin.from('prospect_touchpoints').insert({
    prospect_id: id,
    kind: 'state_change',
    body: 'Socials confirmed',
    metadata: {
      primary_platform: parsed.data.primary_platform,
      primary_handle: parsed.data.primary_handle,
      socials_count: parsed.data.socials.length,
    },
    created_by: auth.userId,
  });

  // PRD D-02 / D-09: fire-and-forget so the API returns in <1s. The
  // analysis itself is bounded (SPY-03 will set its own maxDuration);
  // we just don't block the user on it.
  let analysisTriggered = false;
  if (parsed.data.trigger_analysis) {
    try {
      void runInitialAnalysis(id).catch((err) =>
        console.error(`[prospects] runInitialAnalysis failed for ${id}:`, err),
      );
      analysisTriggered = true;
    } catch (err) {
      console.error('[prospects] failed to schedule initial analysis', err);
    }
  }

  return NextResponse.json({
    prospect: patched as ProspectRow,
    socials,
    analysis_triggered: analysisTriggered,
  });
}
