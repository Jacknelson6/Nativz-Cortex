// VFF-06 T08a: POST /api/admin/formats/taxonomy/proposals/[id]/approve
// super_admin only. Insert proposal into viral_formats, mark approved.
// Body: { retag_existing?: boolean } — if true, rewrite any pre-existing
// viral_video_formats rows that referenced an unresolved slug placeholder
// to point at the freshly minted format_id. Slug-collision case asks the
// caller to use /merge instead.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { gateAndLoadProposal } from '../_auth';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  retag_existing: z.boolean().default(false),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await gateAndLoadProposal(id);
  if (gate.kind === 'err') return gate.res;
  const { user_id, proposal } = gate;

  // Body is optional; default to {} if missing.
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const retag = parsed.data.retag_existing;

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('viral_formats')
    .select('id')
    .eq('kind', proposal.kind)
    .eq('slug', proposal.slug)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: 'slug already exists for kind; use /merge instead', format_id: existing.id },
      { status: 409 },
    );
  }

  const { data: created, error: cErr } = await admin
    .from('viral_formats')
    .insert({
      kind: proposal.kind,
      slug: proposal.slug,
      display_name: proposal.display_name,
      description: proposal.proposed_description ?? null,
      aliases: [],
      is_seeded: false,
    })
    .select('id')
    .single();
  if (cErr || !created) {
    return NextResponse.json({ error: cErr?.message ?? 'create failed' }, { status: 500 });
  }

  let retagged = 0;
  if (retag) {
    // Best-effort: try to update gate_metadata.proposals trail rows where the
    // slug matches. This is a soft retag — viral_video_formats rows for unknown
    // slugs are never inserted by VFF-05, so the rewrite is mostly a no-op
    // today and exists for forward compatibility.
    const { data: rows } = await admin
      .from('viral_videos')
      .select('id, gate_metadata')
      .filter('gate_metadata->proposals', 'not.is', null);
    for (const row of (rows ?? []) as Array<{ id: string; gate_metadata: Record<string, unknown> | null }>) {
      const proposals = Array.isArray(row.gate_metadata?.proposals)
        ? (row.gate_metadata!.proposals as Array<{ kind: string; slug: string }>)
        : [];
      if (proposals.some((p) => p.kind === proposal.kind && p.slug === proposal.slug)) {
        await admin
          .from('viral_video_formats')
          .upsert(
            { video_id: row.id, format_id: created.id, source: 'human', confidence: null },
            { onConflict: 'video_id,format_id' },
          );
        retagged += 1;
      }
    }
  }

  const { error: uErr } = await admin
    .from('format_taxonomy_proposals')
    .update({
      status: 'approved',
      merged_into_format_id: created.id,
      reviewed_by: user_id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: 'approved',
    format_id: created.id,
    retagged,
  });
}
