// VFF-06 T08c: POST /api/admin/formats/taxonomy/proposals/[id]/merge
// super_admin only. Merges proposal into an existing viral_formats row:
// adds proposal.slug to target.aliases (de-duped) so future LLM responses
// resolve, then marks proposal status='merged'.
//
// Body: { target_format_id: uuid }

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { gateAndLoadProposal } from '../_auth';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  target_format_id: z.string().uuid(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await gateAndLoadProposal(id);
  if (gate.kind === 'err') return gate.res;
  const { user_id, proposal } = gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const targetId = parsed.data.target_format_id;

  const admin = createAdminClient();
  const { data: target, error: tErr } = await admin
    .from('viral_formats')
    .select('id, kind, aliases, slug')
    .eq('id', targetId)
    .single<{ id: string; kind: string; aliases: string[] | null; slug: string }>();
  if (tErr || !target) {
    return NextResponse.json({ error: 'target format not found' }, { status: 404 });
  }
  if (target.kind !== proposal.kind) {
    return NextResponse.json({ error: 'target kind mismatch' }, { status: 400 });
  }

  const existingAliases = target.aliases ?? [];
  const mergedAliases = Array.from(new Set([...existingAliases, proposal.slug]));
  const { error: aErr } = await admin
    .from('viral_formats')
    .update({ aliases: mergedAliases })
    .eq('id', targetId);
  if (aErr) {
    return NextResponse.json({ error: aErr.message }, { status: 500 });
  }

  const { error: mErr } = await admin
    .from('format_taxonomy_proposals')
    .update({
      status: 'merged',
      merged_into_format_id: targetId,
      reviewed_by: user_id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: 'merged', format_id: targetId });
}
