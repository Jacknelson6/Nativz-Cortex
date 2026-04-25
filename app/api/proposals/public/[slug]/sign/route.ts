import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSecret } from '@/lib/secrets/store';
import {
  bytesToBase64,
  emailClientSigned,
  emailOpsSigned,
  renderAgreementPdf,
  sha256Hex,
} from '@/lib/proposals/pdf/agreement';
import { getFromAddress, getReplyTo } from '@/lib/email/resend';
import { logLifecycleEvent } from '@/lib/lifecycle/state-machine';
import { publicProposalUrl } from '@/lib/proposals/public-url';
import type { AgencyBrand } from '@/lib/agency/detect';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  // Identity (sent by sign page; we re-verify against the slug in URL)
  slug: z.string().min(1),
  projectName: z.string().min(1).max(300),
  projectShortName: z.string().max(200).optional(),
  proposalUrl: z.string().url().optional(),
  scopeStatement: z.string().max(2000).optional(),
  // Tier the signer chose
  tier: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i),
  tierLabel: z.string().min(1).max(120),
  total: z.number().int().nonnegative(),
  deposit: z.number().int().nonnegative(),
  stripeUrl: z.string().url(),
  // Client/signer
  clientLegalName: z.string().min(1).max(300),
  clientAddress: z.string().min(1).max(500),
  signerName: z.string().min(2).max(200),
  signerTitle: z.string().min(1).max(200),
  signerEmail: z.string().email(),
  signatureDataUrl: z.string().min(20),
  signatureMethod: z.enum(['draw', 'type']).optional(),
  timestamp: z.string().datetime(),
});

type TierPreviewRow = {
  id: string;
  name: string;
  monthly_cents?: number;
  total_cents?: number;
  deposit_cents?: number;
  subscription?: boolean;
  cadence?: 'month' | 'year' | 'week';
};

const OPS_EMAIL_BY_AGENCY: Record<AgencyBrand, string> = {
  anderson: 'info@andersoncollaborative.com',
  nativz: 'cole@nativz.io',
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const admin = createAdminClient();

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid body' },
      { status: 400 },
    );
  }
  const payload = parsed.data;
  if (payload.slug !== slug) {
    return NextResponse.json({ ok: false, error: 'Slug mismatch' }, { status: 400 });
  }

  // Look up proposal + template. Status gate matches CF behavior: only sign
  // when sent or viewed (no double-signing).
  const { data: proposal } = await admin
    .from('proposals')
    .select(
      'id, slug, title, status, agency, template_id, signer_email, expires_at',
    )
    .eq('slug', slug)
    .maybeSingle();
  if (!proposal) {
    return NextResponse.json({ ok: false, error: 'Proposal not found' }, { status: 404 });
  }
  if (['signed', 'paid'].includes(proposal.status)) {
    return NextResponse.json({ ok: false, error: 'Already signed' }, { status: 409 });
  }
  if (!['sent', 'viewed'].includes(proposal.status)) {
    return NextResponse.json(
      { ok: false, error: `Cannot sign a proposal in status '${proposal.status}'` },
      { status: 409 },
    );
  }
  if (proposal.expires_at && new Date(proposal.expires_at) < new Date()) {
    await admin.from('proposals').update({ status: 'expired' }).eq('id', proposal.id);
    return NextResponse.json({ ok: false, error: 'Proposal expired' }, { status: 410 });
  }
  // If admin set a specific signer email, the signer must match (case-insensitive).
  // This is the same lightweight email gate the prior Cortex flow used.
  if (
    proposal.signer_email &&
    proposal.signer_email.trim().toLowerCase() !== payload.signerEmail.trim().toLowerCase()
  ) {
    return NextResponse.json(
      { ok: false, error: 'Email must match the invited signer.' },
      { status: 400 },
    );
  }

  const { data: template } = await admin
    .from('proposal_templates')
    .select('name, tiers_preview, public_base_url')
    .eq('id', proposal.template_id)
    .maybeSingle();
  if (!template) {
    return NextResponse.json({ ok: false, error: 'Template missing' }, { status: 500 });
  }

  // Authoritative tier prices come from the server-side template, not the
  // client-supplied payload. Prevents tier-price tampering.
  const tiers = (template.tiers_preview ?? []) as TierPreviewRow[];
  const trusted = tiers.find((t) => t.id === payload.tier);
  if (!trusted) {
    return NextResponse.json(
      { ok: false, error: `Tier '${payload.tier}' is not part of this proposal.` },
      { status: 400 },
    );
  }
  const trustedTotalDollars = Math.round((trusted.total_cents ?? trusted.monthly_cents ?? 0) / 100);
  const trustedDepositDollars = Math.round((trusted.deposit_cents ?? trusted.monthly_cents ?? 0) / 100);
  const trustedSubscription = trusted.subscription ?? Boolean(trusted.cadence);
  const trustedCadence = (trusted.cadence ?? 'month') as 'month' | 'year' | 'week';
  if (trustedTotalDollars === 0 || trustedDepositDollars === 0) {
    return NextResponse.json(
      { ok: false, error: `Tier '${payload.tier}' has no dollar values configured.` },
      { status: 500 },
    );
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const ua = req.headers.get('user-agent') ?? 'unknown';
  const nowIso = new Date().toISOString();
  const agency: AgencyBrand = (proposal.agency as AgencyBrand) ?? 'anderson';

  // 1. Render canonical PDF.
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await renderAgreementPdf({
      id: proposal.id,
      slug: proposal.slug,
      projectName: payload.projectName,
      projectShortName: payload.projectShortName,
      proposalUrl: payload.proposalUrl ?? publicProposalUrl(agency, proposal.slug),
      scopeStatement: payload.scopeStatement,
      agreementTitle: template.name,
      tier: payload.tier,
      tierLabel: payload.tierLabel,
      total: trustedTotalDollars,
      deposit: trustedDepositDollars,
      subscription: trustedSubscription,
      cadence: trustedCadence,
      clientLegalName: payload.clientLegalName,
      clientAddress: payload.clientAddress,
      signerName: payload.signerName,
      signerTitle: payload.signerTitle,
      signerEmail: payload.signerEmail,
      signatureDataUrl: payload.signatureDataUrl,
      signatureMethod: payload.signatureMethod === 'type' ? 'type' : 'draw',
      // Use server time so the counter-sign render (which reads
      // proposal.signed_at = nowIso) reproduces the same embedded timestamp.
      // payload.timestamp captures the click moment but isn't persisted, so
      // a counter-sign re-render would otherwise drift by network latency.
      signatureTimestamp: nowIso,
      serverTimestamp: nowIso,
      ip,
      userAgent: ua,
    });
  } catch (err) {
    console.error('[proposals:sign] PDF render failed', err);
    return NextResponse.json({ ok: false, error: 'PDF generation failed' }, { status: 500 });
  }
  const pdfHash = await sha256Hex(pdfBytes);
  const pdfBase64 = bytesToBase64(pdfBytes);
  const pdfStoragePath = `signed/${proposal.id}.pdf`;

  // 2. Upload to private Supabase Storage bucket.
  const { error: uploadErr } = await admin.storage
    .from('proposal-pdfs')
    .upload(pdfStoragePath, Buffer.from(pdfBytes), {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (uploadErr) {
    console.error('[proposals:sign] storage upload failed', uploadErr);
    return NextResponse.json({ ok: false, error: 'Storage upload failed' }, { status: 500 });
  }

  // 3. Update the proposal row with sign-time data.
  const { error: updErr } = await admin
    .from('proposals')
    .update({
      status: 'signed',
      signed_at: nowIso,
      signer_name: payload.signerName,
      signer_email: payload.signerEmail,
      signer_title: payload.signerTitle,
      signer_legal_entity: payload.clientLegalName,
      signer_address: payload.clientAddress,
      signature_method: payload.signatureMethod === 'type' ? 'type' : 'draw',
      signature_image: payload.signatureDataUrl,
      signed_pdf_path: pdfStoragePath,
      pdf_sha256: pdfHash,
      pdf_bytes: pdfBytes.byteLength,
      signed_ip: ip,
      signed_user_agent: ua,
      tier_id: payload.tier,
      tier_label: payload.tierLabel,
      total_cents: trustedTotalDollars * 100,
      deposit_cents: trustedDepositDollars * 100,
      cadence: trustedCadence,
      is_subscription: trustedSubscription,
    })
    .eq('id', proposal.id);
  if (updErr) {
    console.error('[proposals:sign] proposals update failed', updErr);
    return NextResponse.json({ ok: false, error: 'Database update failed' }, { status: 500 });
  }

  await admin.from('proposal_events').insert({
    proposal_id: proposal.id,
    type: 'signed',
    ip,
    user_agent: ua,
    metadata: {
      tier: payload.tier,
      pdf_hash: pdfHash,
      signature_method: payload.signatureMethod ?? 'draw',
    },
  });

  // 4. Lifecycle event + admin notification (fires for both prospects and
  //    contracted clients — the proposal-paid path advances to paid_deposit).
  // Look up client_id + linked flow from proposal row (re-fetch since previous row didn't include them).
  const { data: proposalWithClient } = await admin
    .from('proposals')
    .select('client_id, onboarding_flow_id')
    .eq('id', proposal.id)
    .maybeSingle();
  const clientId = proposalWithClient?.client_id ?? null;
  const linkedFlowId = (proposalWithClient as { onboarding_flow_id?: string | null } | null)?.onboarding_flow_id ?? null;
  if (clientId) {
    await admin
      .from('clients')
      .update({ lifecycle_state: 'contracted' })
      .eq('id', clientId)
      .eq('lifecycle_state', 'lead');
    await logLifecycleEvent(clientId, 'proposal.signed', `Proposal signed: ${proposal.title}`, {
      metadata: { proposal_id: proposal.id, slug: proposal.slug, pdf_hash: pdfHash },
      admin,
    });
  }
  // Onboarding flow stays in `awaiting_payment` after sign — only the
  // proposal-paid webhook advances it to `active`. We just bump the
  // updated_at timestamp so the flow row reflects recent activity.
  if (linkedFlowId) {
    await admin
      .from('onboarding_flows')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', linkedFlowId);
  }

  // 5. Email both parties with the PDF attached. Failure here is logged but
  //    does NOT fail the request — the proposal is already legally signed; the
  //    admin can resend manually if a delivery fails.
  const apiKey = (await getSecret('RESEND_API_KEY')) ?? '';
  if (apiKey) {
    const resend = new Resend(apiKey);
    const opsEmail = OPS_EMAIL_BY_AGENCY[agency];
    const safeName = (payload.projectShortName || payload.projectName || 'Agreement')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const pdfFilename = `${safeName}-Agreement-${payload.tierLabel.replace(/\s+/g, '-')}-${proposal.id.slice(0, 8)}.pdf`;
    const clientHtml = emailClientSigned({
      signerName: payload.signerName,
      tierLabel: payload.tierLabel,
      total: trustedTotalDollars,
      deposit: trustedDepositDollars,
      stripeUrl: payload.stripeUrl,
      signerEmail: payload.signerEmail,
      id: proposal.id,
      pdfHash,
      projectName: payload.projectName,
      projectShortName: payload.projectShortName,
      subscription: trustedSubscription,
      cadence: trustedCadence,
      agency,
    });
    const opsHtml = emailOpsSigned({
      clientLegalName: payload.clientLegalName,
      signerName: payload.signerName,
      signerTitle: payload.signerTitle,
      signerEmail: payload.signerEmail,
      clientAddress: payload.clientAddress,
      tierLabel: payload.tierLabel,
      total: trustedTotalDollars,
      deposit: trustedDepositDollars,
      signedAt: nowIso,
      ip,
      ua,
      id: proposal.id,
      pdfHash,
      projectName: payload.projectName,
      subscription: trustedSubscription,
      cadence: trustedCadence,
      agency,
    });
    const subjectClient = trustedSubscription
      ? `Your ${payload.projectName} agreement is signed. First ${trustedCadence} payment link inside (${payload.tierLabel}).`
      : `Your ${payload.projectName} agreement is signed. Deposit link inside (${payload.tierLabel}).`;
    const subjectOps = `[Signed · ${payload.projectName}] ${payload.clientLegalName} · ${payload.tierLabel} ($${trustedDepositDollars.toLocaleString()} ${trustedSubscription ? 'first ' + trustedCadence : 'deposit'} pending)`;

    await Promise.all([
      resend.emails
        .send({
          from: getFromAddress(agency),
          replyTo: getReplyTo(agency),
          to: payload.signerEmail,
          subject: subjectClient,
          html: clientHtml,
          attachments: [{ filename: pdfFilename, content: pdfBase64 }],
        } as Parameters<Resend['emails']['send']>[0])
        .catch((e) => console.error('[proposals:sign] client email failed', e)),
      resend.emails
        .send({
          from: getFromAddress(agency),
          replyTo: payload.signerEmail,
          to: opsEmail,
          subject: subjectOps,
          html: opsHtml,
          attachments: [{ filename: pdfFilename, content: pdfBase64 }],
        } as Parameters<Resend['emails']['send']>[0])
        .catch((e) => console.error('[proposals:sign] ops email failed', e)),
    ]);
  } else {
    console.warn('[proposals:sign] RESEND_API_KEY not configured — skipped emails.');
  }

  // 6. Build the Stripe redirect. Cortex proposal id rides as `client_reference_id`
  //    so the Stripe checkout.session.completed webhook can match the paid
  //    session back to this proposal.
  const redirectUrl = `${payload.stripeUrl}?prefilled_email=${encodeURIComponent(
    payload.signerEmail,
  )}&client_reference_id=${proposal.id}`;

  return NextResponse.json({
    ok: true,
    id: proposal.id,
    pdfHash,
    redirectUrl,
    deposit: trustedDepositDollars,
    total: trustedTotalDollars,
  });
}
