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
  /**
   * Sales-pipeline unification (2026-04-25 spec): when true and `clientId`
   * is null, auto-create a thin `clients` row from the signer info so the
   * proposal — and the onboarding flow that auto-creates on sign — always
   * has a real client target. The new row carries `lifecycle_state='lead'`
   * and `auto_created_from_proposal_id=<this proposal>`. Skip when the
   * caller has already resolved a clients row (existing-client path) or
   * doesn't want the side effect (e.g. the legacy chat tool that just
   * wants a draft attached to nothing).
   *
   * Defaults to `true` because every UI surface that calls this should
   * end up with a linked client — the explicit opt-out is for tests and
   * for the rare admin path that creates a draft without a brand identity.
   */
  autoCreateClient?: boolean;
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
  let resolvedClientId: string | null = input.clientId ?? null;

  if (resolvedClientId) {
    const { data: client } = await admin
      .from('clients')
      .select('id, name')
      .eq('id', resolvedClientId)
      .maybeSingle();
    if (client) clientTradeName = (client.name as string | null) ?? null;
  } else if (input.autoCreateClient !== false) {
    // Sales-pipeline unification: every proposal needs a real clients row
    // so the post-sign onboarding flow auto-creation has a target. Spawn
    // a thin lead row from the signer info. We back-reference proposal_id
    // *after* the proposal insert below — the FK on clients.auto_created_
    // from_proposal_id is nullable + deferred so this two-step write is
    // safe.
    const tradeName = (input.signerLegalEntity ?? input.signerName).trim();
    const baseSlug = slugify(tradeName) || 'lead';
    const newSlug = `${baseSlug}-${randomSuffix(6)}`;

    // First check for an existing clients row with the same signer email —
    // re-using a brand the admin has reached out to before is the more
    // common case than spawning a duplicate. Match against any contact
    // row keyed to that email, falling back to a name match if none.
    const lowerEmail = input.signerEmail.trim().toLowerCase();
    const { data: byContact } = await admin
      .from('client_contacts')
      .select('client_id')
      .ilike('email', lowerEmail)
      .limit(1)
      .maybeSingle();
    if (byContact?.client_id) {
      resolvedClientId = byContact.client_id as string;
      const { data: existingClient } = await admin
        .from('clients')
        .select('name')
        .eq('id', resolvedClientId)
        .maybeSingle();
      clientTradeName = (existingClient?.name as string | null) ?? tradeName;
    } else {
      const { data: byName } = await admin
        .from('clients')
        .select('id, name')
        .ilike('name', tradeName)
        .limit(1)
        .maybeSingle();
      if (byName?.id) {
        resolvedClientId = byName.id as string;
        clientTradeName = (byName.name as string | null) ?? tradeName;
      } else {
        const { data: newClient, error: newClientErr } = await admin
          .from('clients')
          .insert({
            name: tradeName,
            slug: newSlug,
            agency: templateRow.agency,
            lifecycle_state: 'lead',
            hide_from_roster: false,
          })
          .select('id, name')
          .single();
        if (newClientErr || !newClient) {
          return {
            ok: false,
            error: `Could not auto-create prospect: ${newClientErr?.message ?? 'unknown'}`,
            status: 500,
          };
        }
        resolvedClientId = newClient.id as string;
        clientTradeName = (newClient.name as string | null) ?? tradeName;
      }
    }
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
      client_id: resolvedClientId,
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

  // Back-reference the auto-created clients row to this proposal so we can
  // identify auto-spawned leads later (only set when this call created the
  // client — existing-client matches stay flag-free). Best-effort: if the
  // back-write fails the proposal is still good, the flag is just metadata.
  if (
    resolvedClientId &&
    !input.clientId &&
    input.autoCreateClient !== false
  ) {
    await admin
      .from('clients')
      .update({ auto_created_from_proposal_id: inserted.id })
      .eq('id', resolvedClientId)
      .is('auto_created_from_proposal_id', null);
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
      if (resolvedClientId) {
        await logLifecycleEvent(
          resolvedClientId,
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
