import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/client';
import { sendOnboardingEmail } from '@/lib/email/resend';
import { formatCents } from '@/lib/format/money';
import { buildProposalSnapshot } from './snapshot';

type AdminClient = SupabaseClient;

type ProposalRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  signer_name: string | null;
  signer_email: string | null;
  total_cents: number | null;
  deposit_cents: number | null;
  currency: string;
  client_id: string | null;
  stripe_payment_link_id: string | null;
  stripe_payment_link_url: string | null;
};

export async function sendProposal(
  proposalId: string,
  opts: { admin?: AdminClient } = {},
): Promise<{ ok: true; url: string; paymentLinkUrl: string | null } | { ok: false; error: string }> {
  const admin = opts.admin ?? createAdminClient();

  const { data: proposal, error } = await admin
    .from('proposals')
    .select(
      'id, slug, title, status, signer_name, signer_email, total_cents, deposit_cents, currency, client_id, stripe_payment_link_id, stripe_payment_link_url, sent_snapshot, payment_link_deposit_cents',
    )
    .eq('id', proposalId)
    .maybeSingle();
  if (error || !proposal) return { ok: false, error: 'Proposal not found' };
  if (!proposal.signer_email) return { ok: false, error: 'Signer email is required' };
  if (!['draft', 'sent', 'viewed'].includes(proposal.status)) {
    return { ok: false, error: `Cannot send a proposal in status '${proposal.status}'` };
  }

  // Snapshot on first send only — subsequent resends keep the original.
  if (!proposal.sent_snapshot) {
    const snapshot = await buildProposalSnapshot(admin, proposal.id);
    if (snapshot) {
      await admin
        .from('proposals')
        .update({ sent_snapshot: snapshot })
        .eq('id', proposal.id);
    }
  }

  const { data: packages } = await admin
    .from('proposal_packages')
    .select('id, name, setup_cents, monthly_cents')
    .eq('proposal_id', proposal.id)
    .order('sort_order');

  let paymentLinkUrl: string | null = proposal.stripe_payment_link_url;
  let paymentLinkId: string | null = proposal.stripe_payment_link_id;
  // Deposit semantics: null → default to setup + first-month; 0 → explicit
  // "no deposit, no Payment Link". Any positive integer is treated as the
  // exact deposit amount.
  const depositCents = proposal.deposit_cents ?? defaultDeposit(packages ?? []);

  // If the Payment Link was minted against a different deposit amount than
  // what we're sending now, archive the old link + recreate so the signer
  // pays the current amount. Handles: admin created a draft at $5k deposit,
  // sent, then revised the draft (via DB or future admin UI) to $3k before
  // a resend.
  if (
    paymentLinkId &&
    proposal.payment_link_deposit_cents !== null &&
    proposal.payment_link_deposit_cents !== depositCents
  ) {
    try {
      await getStripe().paymentLinks.update(paymentLinkId, { active: false });
    } catch (err) {
      console.error('[proposals:send] failed to archive stale Payment Link:', err);
    }
    paymentLinkId = null;
    paymentLinkUrl = null;
    await admin
      .from('proposals')
      .update({
        stripe_payment_link_id: null,
        stripe_payment_link_url: null,
        payment_link_deposit_cents: null,
      })
      .eq('id', proposal.id);
  }

  if (depositCents > 0 && !paymentLinkUrl) {
    const result = await createDepositPaymentLink({
      proposal,
      depositCents,
    });
    if (!result.ok) return { ok: false, error: result.error };
    paymentLinkUrl = result.url;
    paymentLinkId = result.id;
    await admin
      .from('proposals')
      .update({
        stripe_payment_link_id: result.id,
        stripe_payment_link_url: result.url,
        payment_link_deposit_cents: depositCents,
      })
      .eq('id', proposal.id);
  }

  const proposalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://cortex.nativz.io'}/proposals/${proposal.slug}`;

  const email = buildSendEmail({
    title: proposal.title,
    signerName: proposal.signer_name,
    proposalUrl,
    totalCents: proposal.total_cents ?? null,
    depositCents,
    currency: proposal.currency,
  });

  const send = await sendOnboardingEmail({
    to: proposal.signer_email,
    subject: email.subject,
    html: email.html,
  });
  if (!send.ok) return { ok: false, error: `Resend: ${send.error}` };

  await admin
    .from('proposals')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', proposal.id);

  await admin.from('proposal_events').insert({
    proposal_id: proposal.id,
    type: 'sent',
    metadata: { to: proposal.signer_email, resend_id: send.id },
  });

  return { ok: true, url: proposalUrl, paymentLinkUrl };
}

async function createDepositPaymentLink(args: {
  proposal: ProposalRow;
  depositCents: number;
}): Promise<{ ok: true; id: string; url: string } | { ok: false; error: string }> {
  const stripe = getStripe();
  try {
    const product = await stripe.products.create({
      name: `${args.proposal.title} — deposit`,
      metadata: { cortex_proposal_id: args.proposal.id },
    });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: args.depositCents,
      currency: args.proposal.currency,
    });
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://cortex.nativz.io'}/proposals/${args.proposal.slug}/paid`,
        },
      },
      metadata: {
        cortex_proposal_id: args.proposal.id,
        cortex_proposal_slug: args.proposal.slug,
      },
    });
    return { ok: true, id: paymentLink.id, url: paymentLink.url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Stripe error' };
  }
}

function defaultDeposit(packages: Array<{ setup_cents: number | null; monthly_cents: number | null }>): number {
  return packages.reduce((s, p) => s + (p.setup_cents ?? 0) + (p.monthly_cents ?? 0), 0);
}

function buildSendEmail(args: {
  title: string;
  signerName: string | null;
  proposalUrl: string;
  totalCents: number | null;
  depositCents: number;
  currency: string;
}): { subject: string; html: string } {
  const first = (args.signerName ?? '').split(' ')[0] || 'there';
  const depositLine =
    args.depositCents > 0
      ? `<p>A deposit of <strong>${formatCents(args.depositCents, args.currency)}</strong> is due on signing — you'll see the pay button after you sign.</p>`
      : '';

  const html = [
    `<p>Hi ${first},</p>`,
    `<p>Your proposal — <strong>${escape(args.title)}</strong> — is ready for review and signature.</p>`,
    depositLine,
    `<p><a href="${args.proposalUrl}" style="background:#22d3ee;color:#0b0f14;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600;">Review and sign</a></p>`,
    `<p style="color:#888;font-size:13px;">Or open: <a href="${args.proposalUrl}">${args.proposalUrl}</a></p>`,
    `<p>Questions? Just reply — this email comes straight to us.</p>`,
    `<p>— Nativz</p>`,
  ].join('\n');

  return {
    subject: `Proposal: ${args.title}`,
    html,
  };
}

function escape(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
