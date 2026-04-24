import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { logLifecycleEvent } from '@/lib/lifecycle/state-machine';

type AdminClient = SupabaseClient;

export async function onProposalCheckoutCompleted(
  session: Stripe.Checkout.Session,
  admin: AdminClient = createAdminClient(),
): Promise<void> {
  const proposalId = session.metadata?.cortex_proposal_id;
  if (!proposalId) return;

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
    type: 'clicked_pay',
    metadata: {
      checkout_session: session.id,
      amount_cents: session.amount_total ?? null,
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
