import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { renderDraftAsTemplateTier } from '@/lib/proposals/draft-render';
import { createProposalDraft } from '@/lib/proposals/create';

const Body = z.object({
  send_email: z.boolean().optional().default(true),
});

/**
 * POST /api/admin/proposals/drafts/[id]/commit — turns a finished
 * draft into a real `proposals` row by going through the existing
 * createProposalDraft pipeline.
 *
 * Bridge strategy: the legacy proposal flow expects a template_id +
 * tier. The chat-built draft has neither. renderDraftAsTemplateTier()
 * synthesizes a transient template + tier from the draft so the
 * canonical proposal renderer + sign + Stripe flow keep working
 * without a parallel pipeline.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: draftId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'bad body' }, { status: 400 });
  }

  const { data: draft } = await admin
    .from('proposal_drafts')
    .select('*, clients(name, slug, logo_url)')
    .eq('id', draftId)
    .maybeSingle();
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 });
  if (draft.status === 'committed' && draft.committed_proposal_id) {
    return NextResponse.json({
      ok: true,
      already: true,
      proposal_id: draft.committed_proposal_id,
    });
  }
  if (!draft.signer_name || !draft.signer_email) {
    return NextResponse.json(
      { error: 'signer name + email required before commit' },
      { status: 400 },
    );
  }
  if (!Array.isArray(draft.service_lines) || draft.service_lines.length === 0) {
    return NextResponse.json({ error: 'add at least one service line' }, { status: 400 });
  }

  // Synthesize a transient template + tier so the canonical pipeline
  // accepts the draft. This writes a proposal_templates row marked
  // `active=false` (so it doesn't pollute the picker) with one tier
  // matching the draft totals.
  const synth = await renderDraftAsTemplateTier(draft as never, admin);
  if (!synth.ok) {
    return NextResponse.json({ error: synth.error }, { status: 500 });
  }

  const result = await createProposalDraft(
    {
      templateId: synth.templateId,
      clientId: (draft.client_id as string | null) ?? null,
      flowId: (draft.flow_id as string | null) ?? null,
      title: (draft.title as string | null) ?? undefined,
      signerName: draft.signer_name as string,
      signerEmail: draft.signer_email as string,
      signerTitle: (draft.signer_title as string | null) ?? null,
      signerLegalEntity: (draft.signer_legal_entity as string | null) ?? null,
      signerAddress: (draft.signer_address as string | null) ?? null,
      sendEmail: parsed.data.send_email,
      createdBy: user.id,
    },
    admin,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }

  await admin
    .from('proposal_drafts')
    .update({ status: 'committed', committed_proposal_id: result.proposalId })
    .eq('id', draftId);

  return NextResponse.json({
    ok: true,
    proposal_id: result.proposalId,
    slug: result.slug,
    url: result.url,
    sent: result.sent,
    send_error: result.sendError,
  });
}
