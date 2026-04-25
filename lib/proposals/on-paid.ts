import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';
import { logLifecycleEvent } from '@/lib/lifecycle/state-machine';
import {
  bytesToBase64,
  emailClientPaid,
  emailOpsPaid,
  renderAgreementPdf,
  sha256Hex,
} from '@/lib/proposals/pdf/agreement';
import { getFromAddress, getReplyTo } from '@/lib/email/resend';
import { getSecret } from '@/lib/secrets/store';
import type { AgencyBrand } from '@/lib/agency/detect';

type AdminClient = SupabaseClient;

const OPS_EMAIL_BY_AGENCY: Record<AgencyBrand, string> = {
  anderson: 'info@andersoncollaborative.com',
  nativz: 'cole@nativz.io',
};

/**
 * Stripe `checkout.session.completed` handler for proposals.
 *
 * Match order:
 *   1. session.metadata.cortex_proposal_id (legacy — Cortex-created Payment Links)
 *   2. session.client_reference_id (set by /api/proposals/public/[slug]/sign)
 *
 * Once matched:
 *   - Mark proposal paid + log lifecycle event + bump client.lifecycle_state.
 *   - Re-render the agreement PDF with the `counterSigned` block populated
 *     from the Stripe session, upload to Storage, email both parties with
 *     the executed PDF attached. Idempotent — paid proposals short-circuit.
 */
export async function onProposalCheckoutCompleted(
  session: Stripe.Checkout.Session,
  admin: AdminClient = createAdminClient(),
): Promise<void> {
  const proposalId =
    session.metadata?.cortex_proposal_id || session.client_reference_id || null;
  if (!proposalId) return;

  const { data: proposal } = await admin
    .from('proposals')
    .select(
      'id, client_id, slug, title, status, agency, signer_name, signer_email, signer_title, signer_legal_entity, signer_address, signature_method, signature_image, signature_method, tier_id, tier_label, total_cents, deposit_cents, cadence, is_subscription, signed_at, signed_ip, signed_user_agent, template_id',
    )
    .eq('id', proposalId)
    .maybeSingle();
  if (!proposal) return;
  if (proposal.status === 'paid') return;

  const nowIso = new Date().toISOString();

  // Always mark paid first — even if downstream PDF/email fail, the source-of-
  // truth flips so the admin UI reflects reality.
  await admin
    .from('proposals')
    .update({
      status: 'paid',
      paid_at: nowIso,
      stripe_checkout_session_id: session.id,
    })
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

  // Counter-sign + execution emails are best-effort. We don't unwind the
  // paid status if any of this fails — the admin can resend manually.
  await counterSignAndEmail(admin, proposal, session, nowIso).catch((err) => {
    console.error('[proposals:on-paid] counter-sign + email failed:', err);
  });
}

type SignedProposal = {
  id: string;
  client_id: string | null;
  slug: string;
  title: string;
  status: string;
  agency: AgencyBrand | null;
  signer_name: string | null;
  signer_email: string | null;
  signer_title: string | null;
  signer_legal_entity: string | null;
  signer_address: string | null;
  signature_method: 'draw' | 'type' | null;
  signature_image: string | null;
  tier_id: string | null;
  tier_label: string | null;
  total_cents: number | null;
  deposit_cents: number | null;
  cadence: 'month' | 'year' | 'week' | null;
  is_subscription: boolean | null;
  signed_at: string | null;
  signed_ip: string | null;
  signed_user_agent: string | null;
  template_id: string | null;
};

async function counterSignAndEmail(
  admin: AdminClient,
  proposal: SignedProposal,
  session: Stripe.Checkout.Session,
  paidAtIso: string,
): Promise<void> {
  if (!proposal.signature_image || !proposal.signer_email || !proposal.tier_label) {
    console.warn(
      `[proposals:on-paid] proposal ${proposal.id} missing sign-time data; skipping counter-sign.`,
    );
    return;
  }

  // Pull the agreement title from the linked template.
  const { data: template } = await admin
    .from('proposal_templates')
    .select('name, public_base_url')
    .eq('id', proposal.template_id)
    .maybeSingle();
  const agreementTitle = template?.name ?? proposal.title;

  const agency: AgencyBrand = proposal.agency ?? 'anderson';
  const totalDollars = Math.round((proposal.total_cents ?? 0) / 100);
  const depositDollars = Math.round((proposal.deposit_cents ?? 0) / 100);
  const stripePaymentIntent =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? '';
  const stripeCustomer =
    typeof session.customer === 'string' ? session.customer : session.customer?.id ?? '';
  const amountPaidCents = session.amount_total ?? 0;
  const cadence = (proposal.cadence ?? 'month') as 'month' | 'year' | 'week';

  // 1. Re-render the canonical PDF with the counterSigned block populated.
  const pdfBytes = await renderAgreementPdf({
    id: proposal.id,
    slug: proposal.slug,
    projectName: proposal.title,
    projectShortName: agreementTitle,
    proposalUrl: `${template?.public_base_url ?? ''}/proposals/${proposal.slug}`,
    agreementTitle,
    tier: proposal.tier_id ?? '',
    tierLabel: proposal.tier_label,
    total: totalDollars,
    deposit: depositDollars,
    subscription: !!proposal.is_subscription,
    cadence,
    clientLegalName: proposal.signer_legal_entity ?? '',
    clientAddress: proposal.signer_address ?? '',
    signerName: proposal.signer_name ?? '',
    signerTitle: proposal.signer_title ?? '',
    signerEmail: proposal.signer_email,
    signatureDataUrl: proposal.signature_image,
    signatureMethod: proposal.signature_method === 'type' ? 'type' : 'draw',
    signatureTimestamp: proposal.signed_at ?? paidAtIso,
    serverTimestamp: paidAtIso,
    ip: proposal.signed_ip ?? 'unknown',
    userAgent: proposal.signed_user_agent ?? 'unknown',
    counterSigned: {
      date: paidAtIso,
      stripePaymentIntent,
      stripeCustomer,
      amountPaid: amountPaidCents,
    },
  });
  const executedHash = await sha256Hex(pdfBytes);
  const executedBase64 = bytesToBase64(pdfBytes);
  const executedPath = `executed/${proposal.id}.pdf`;

  const { error: uploadErr } = await admin.storage
    .from('proposal-pdfs')
    .upload(executedPath, Buffer.from(pdfBytes), {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (uploadErr) {
    console.error('[proposals:on-paid] executed PDF upload failed:', uploadErr);
    return;
  }

  await admin
    .from('proposals')
    .update({
      counter_signed_at: paidAtIso,
      counter_signed_pdf_path: executedPath,
    })
    .eq('id', proposal.id);

  // 2. Email both parties with the executed PDF attached.
  const apiKey = (await getSecret('RESEND_API_KEY')) ?? '';
  if (!apiKey) {
    console.warn('[proposals:on-paid] RESEND_API_KEY not configured — skipped execution emails.');
    return;
  }
  const resend = new Resend(apiKey);
  const opsEmail = OPS_EMAIL_BY_AGENCY[agency];
  const safeName = (agreementTitle || 'Agreement')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const pdfFilename = `${safeName}-Executed-${proposal.tier_label.replace(/\s+/g, '-')}-${proposal.id.slice(0, 8)}.pdf`;

  const clientHtml = emailClientPaid({
    signerName: proposal.signer_name ?? '',
    tierLabel: proposal.tier_label,
    total: totalDollars,
    deposit: depositDollars,
    amountPaid: amountPaidCents,
    id: proposal.id,
    executedHash,
    projectName: proposal.title,
    subscription: !!proposal.is_subscription,
    cadence,
  });
  const opsHtml = emailOpsPaid({
    clientLegalName: proposal.signer_legal_entity ?? '',
    signerName: proposal.signer_name ?? '',
    signerEmail: proposal.signer_email,
    tierLabel: proposal.tier_label,
    total: totalDollars,
    deposit: depositDollars,
    amountPaid: amountPaidCents,
    stripeCustomer,
    stripePaymentIntent,
    id: proposal.id,
    projectName: proposal.title,
    subscription: !!proposal.is_subscription,
    cadence,
  });

  const subjectClient = proposal.is_subscription
    ? `First ${cadence} received. Fully executed ${proposal.title} agreement attached.`
    : `Deposit received. Fully executed ${proposal.title} agreement attached.`;
  const subjectOps = `[Paid · ${proposal.title}] ${proposal.signer_legal_entity ?? proposal.signer_name} · ${proposal.tier_label} ($${(amountPaidCents / 100).toFixed(2)} cleared)`;

  await Promise.all([
    resend.emails
      .send({
        from: getFromAddress(agency),
        replyTo: getReplyTo(agency),
        to: proposal.signer_email,
        subject: subjectClient,
        html: clientHtml,
        attachments: [{ filename: pdfFilename, content: executedBase64 }],
      } as Parameters<Resend['emails']['send']>[0])
      .catch((e) => console.error('[proposals:on-paid] client email failed', e)),
    resend.emails
      .send({
        from: getFromAddress(agency),
        replyTo: proposal.signer_email,
        to: opsEmail,
        subject: subjectOps,
        html: opsHtml,
        attachments: [{ filename: pdfFilename, content: executedBase64 }],
      } as Parameters<Resend['emails']['send']>[0])
      .catch((e) => console.error('[proposals:on-paid] ops email failed', e)),
  ]);
}
