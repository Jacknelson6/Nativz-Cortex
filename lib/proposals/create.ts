/**
 * Core proposal creation logic, factored out of the route handler so both
 * the admin REST endpoint and Nerd's `create_proposal` tool can share it.
 *
 * Inserts a proposals row, generates a slug, sets external_url to the
 * agency-aware Cortex public path, optionally fires the branded "Review &
 * sign" email, and writes lifecycle + proposal_events trail.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { randomSuffix, slugify } from './slug';
import { publicProposalUrl } from './public-url';
import { sendProposal } from './send';
import { logLifecycleEvent } from '@/lib/lifecycle/state-machine';

export type CreateProposalInput = {
  templateId: string;
  signerName: string;
  signerEmail: string;
  signerTitle?: string | null;
  signerLegalEntity?: string | null;
  signerAddress?: string | null;
  clientId?: string | null;
  /** When set, links the new proposal to an onboarding flow and advances
   *  the flow to 'awaiting_payment' on insert. */
  flowId?: string | null;
  title?: string | null;
  sendEmail?: boolean;
  createdBy?: string | null;
};

export type CreateProposalOk = {
  ok: true;
  proposalId: string;
  slug: string;
  url: string;
  sent: boolean;
  sendError: string | null;
};

export type CreateProposalErr = { ok: false; error: string; status?: number };

export async function createProposalDraft(
  input: CreateProposalInput,
  admin: SupabaseClient = createAdminClient(),
): Promise<CreateProposalOk | CreateProposalErr> {
  const { data: templateRow, error: tplErr } = await admin
    .from('proposal_templates')
    .select('id, agency, name, source_folder, active')
    .eq('id', input.templateId)
    .maybeSingle<{
      id: string;
      agency: 'anderson' | 'nativz';
      name: string;
      source_folder: string;
      active: boolean;
    }>();
  if (tplErr) return { ok: false, error: tplErr.message, status: 500 };
  if (!templateRow || !templateRow.active) {
    return { ok: false, error: 'Template not found or inactive', status: 404 };
  }

  let clientTradeName: string | null = null;
  if (input.clientId) {
    const { data: client } = await admin
      .from('clients')
      .select('id, name')
      .eq('id', input.clientId)
      .maybeSingle();
    if (client) clientTradeName = (client.name as string | null) ?? null;
  }

  const title =
    input.title?.trim() ||
    `${templateRow.name}${clientTradeName ? ` — ${clientTradeName}` : ''}`;
  const slugBase =
    slugify(`${templateRow.name} ${clientTradeName ?? input.signerName}`) || 'proposal';
  const slug = `${slugBase}-${randomSuffix(6)}`;
  const publicUrl = publicProposalUrl(templateRow.agency, slug);

  const { data: inserted, error: insertErr } = await admin
    .from('proposals')
    .insert({
      title,
      slug,
      client_id: input.clientId ?? null,
      signer_name: input.signerName,
      signer_email: input.signerEmail,
      signer_title: input.signerTitle ?? null,
      signer_legal_entity: input.signerLegalEntity ?? null,
      signer_address: input.signerAddress ?? null,
      status: 'sent',
      sent_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
      template_id: templateRow.id,
      agency: templateRow.agency,
      external_url: publicUrl,
      external_repo: null,
      external_folder: null,
      created_by: input.createdBy ?? null,
      onboarding_flow_id: input.flowId ?? null,
    })
    .select('id, slug')
    .single();
  if (insertErr || !inserted) {
    return { ok: false, error: insertErr?.message ?? 'Insert failed', status: 500 };
  }

  // Link the flow → proposal and advance status. The flow's "Agreement &
  // Payment" segment will auto-tick from proposal events going forward.
  if (input.flowId) {
    await admin
      .from('onboarding_flows')
      .update({
        proposal_id: inserted.id,
        status: 'awaiting_payment',
      })
      .eq('id', input.flowId);
  }

  await admin.from('proposal_events').insert({
    proposal_id: inserted.id,
    type: 'published',
    metadata: { url: publicUrl, agency: templateRow.agency },
  });

  let sent = false;
  let sendError: string | null = null;
  if (input.sendEmail !== false) {
    const sendResult = await sendProposal(inserted.id, { admin });
    if (!sendResult.ok) {
      sendError = sendResult.error;
    } else {
      sent = true;
      if (input.clientId) {
        await logLifecycleEvent(
          input.clientId,
          'proposal.sent',
          `Proposal sent: ${title}`,
          {
            metadata: { proposal_id: inserted.id, slug: inserted.slug, url: publicUrl },
            admin,
          },
        );
      }
    }
  }

  return {
    ok: true,
    proposalId: inserted.id,
    slug: inserted.slug,
    url: publicUrl,
    sent,
    sendError,
  };
}
