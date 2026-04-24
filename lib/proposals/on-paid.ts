import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { logLifecycleEvent } from '@/lib/lifecycle/state-machine';

type AdminClient = SupabaseClient;

/**
 * Link a paid Stripe checkout session back to a Cortex proposal. Advances the
 * proposal + client lifecycle and writes audit trail.
 *
 * Matching order:
 *   1. session.metadata.cortex_proposal_id — set when Cortex creates the
 *      Payment Link itself (legacy path, still used for one-offs).
 *   2. session.client_reference_id — set by the CF-side sign.ts when it
 *      redirects to the Stripe Payment Link. This is the new default for
 *      template-generated proposals whose Payment Links are pre-built in
 *      the Stripe dashboard (no per-prospect metadata available).
 */
export async function onProposalCheckoutCompleted(
  session: Stripe.Checkout.Session,
  admin: AdminClient = createAdminClient(),
): Promise<void> {
  const proposalId =
    session.metadata?.cortex_proposal_id || session.client_reference_id || null;
  if (!proposalId) return;

  // client_reference_id is whatever the CF side sent — either a Cortex UUID
  // (good) or a CF signing id (legacy). Only match on UUIDs the proposals
  // table actually knows.
  const { data: proposal } = await admin
    .from('proposals')
    .select('id, client_id, title, status')
    .eq('id', proposalId)
    .maybeSingle();
  if (!proposal) return;
  if (proposal.status === 'paid') return;

  await admin
    .from('proposals')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', proposal.id);

  await admin.from('proposal_events').insert({
    proposal_id: proposal.id,
    type: 'paid',
    metadata: {
      checkout_session: session.id,
      amount_cents: session.amount_total ?? null,
      client_reference_id: session.client_reference_id ?? null,
    },
  });

  if (proposal.client_id) {
    await admin
      .from('clients')
      .update({ lifecycle_state: 'paid_deposit' })
      .eq('id', proposal.client_id)
      .in('lifecycle_state', ['lead', 'contracted']);

    await logLifecycleEvent(proposal.client_id, 'proposal.paid', `Deposit paid: ${proposal.title}`, {
      metadata: {
        proposal_id: proposal.id,
        checkout_session: session.id,
        amount_cents: session.amount_total ?? null,
      },
      admin,
    });
  }
}
