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
import { ensureFlowForClient } from '@/lib/onboarding/flows';
import { instantiateBlueprintForFlow } from '@/lib/onboarding/blueprint';
import type { AgencyBrand } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Anyone-with-link sign endpoint for offer templates.
 *
 * Distinct from /api/proposals/public/[slug]/sign which signs a pre-existing
 * proposal record. Here the signer hits the template's shared URL, picks a
 * tier, and we create the proposal + (find-or-create) client + onboarding
 * flow on submit. The blueprint stored on the template's tier_intake_blueprint
 * column is instantiated into the flow so the public intake form has tier-aware
 * checklist items ready when the client visits the share token URL.
 */

const bodySchema = z.object({
  slug: z.string().min(1),
  templateId: z.string().uuid(),
  tier: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i),
  tierLabel: z.string().min(1).max(120),
  clientLegalName: z.string().min(1).max(300),
  clientAddress: z.string().min(1).max(500).nullable().optional(),
  signerName: z.string().min(2).max(200),
  signerTitle: z.string().min(1).max(200),
  signerEmail: z.string().email(),
  typedSignature: z.string().min(2).max(200),
  agency: z.enum(['anderson', 'nativz']).optional(),
  timestamp: z.string().datetime(),
});

type TierPreviewRow = {
  id: string;
  name: string;
  monthly_cents?: number | null;
  total_cents?: number | null;
  deposit_cents?: number | null;
  subscription?: boolean | null;
  cadence?: 'month' | 'year' | 'week' | null;
  stripe_payment_link?: string | null;
};

const OPS_EMAIL_BY_AGENCY: Record<AgencyBrand, string> = {
  anderson: 'info@andersoncollaborative.com',
  nativz: 'cole@nativz.io',
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function typedSignatureToDataUrl(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="120"><text x="20" y="80" font-family="Georgia, serif" font-style="italic" font-size="56" fill="#0b0b0b">${escaped}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug: routeSlug } = await ctx.params;
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
  if (payload.slug !== routeSlug) {
    return NextResponse.json({ ok: false, error: 'Slug mismatch' }, { status: 400 });
  }

  const { data: template, error: templateError } = await admin
    .from('proposal_templates')
    .select('id, agency, name, source_folder, public_base_url, tiers_preview, active')
    .eq('id', payload.templateId)
    .maybeSingle();
  if (templateError || !template || !template.active) {
    return NextResponse.json({ ok: false, error: 'Offer not found' }, { status: 404 });
  }
  if (template.source_folder !== routeSlug) {
    return NextResponse.json({ ok: false, error: 'Template/slug mismatch' }, { status: 400 });
  }

  const tiers = (template.tiers_preview ?? []) as TierPreviewRow[];
  const tier = tiers.find((t) => t.id === payload.tier);
  if (!tier) {
    return NextResponse.json(
      { ok: false, error: `Tier '${payload.tier}' is not part of this offer.` },
      { status: 400 },
    );
  }

  const totalCents = tier.total_cents ?? tier.monthly_cents ?? 0;
  const depositCents = tier.deposit_cents ?? tier.monthly_cents ?? 0;
  const isSubscription = tier.subscription ?? Boolean(tier.cadence);
  const cadence = (tier.cadence ?? 'month') as 'month' | 'year' | 'week';
  if (totalCents === 0 || depositCents === 0) {
    return NextResponse.json(
      { ok: false, error: `Tier '${payload.tier}' has no price configured.` },
      { status: 500 },
    );
  }

  const agency: AgencyBrand = payload.agency ?? (template.agency as AgencyBrand) ?? 'anderson';
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const ua = req.headers.get('user-agent') ?? 'unknown';
  const nowIso = new Date().toISOString();

  // 1. Find or auto-create a client. Match by signer email first (if a client
  //    has any contact with that email, reuse), else create a fresh lead.
  const legalSlugBase = slugify(payload.clientLegalName) || 'lead';
  let clientId: string | null = null;

  {
    const { data: existingByLegal } = await admin
      .from('clients')
      .select('id')
      .ilike('name', payload.clientLegalName.trim())
      .limit(1)
      .maybeSingle();
    if (existingByLegal) clientId = existingByLegal.id;
  }

  if (!clientId) {
    let candidateSlug = legalSlugBase;
    const { data: collision } = await admin
      .from('clients')
      .select('id')
      .eq('slug', candidateSlug)
      .maybeSingle();
    if (collision) {
      candidateSlug = `${legalSlugBase}-${Date.now().toString(36).slice(-5)}`;
    }

    const { data: org, error: orgError } = await admin
      .from('organizations')
      .insert({
        name: payload.clientLegalName,
        slug: candidateSlug,
        type: 'client',
      })
      .select('id')
      .single();
    if (orgError || !org) {
      console.error('[offer:sign] org insert failed', orgError);
      return NextResponse.json({ ok: false, error: 'Could not create organization' }, { status: 500 });
    }

    const { data: newClient, error: clientError } = await admin
      .from('clients')
      .insert({
        name: payload.clientLegalName,
        slug: candidateSlug,
        industry: 'Pending intake',
        organization_id: org.id,
        agency,
        services: agency === 'anderson' ? ['Editing'] : [],
        is_active: true,
        lifecycle_state: 'lead',
      })
      .select('id')
      .single();
    if (clientError || !newClient) {
      console.error('[offer:sign] client insert failed', clientError);
      return NextResponse.json({ ok: false, error: 'Could not create client' }, { status: 500 });
    }
    clientId = newClient.id;
  }

  if (!clientId) {
    return NextResponse.json({ ok: false, error: 'Client resolution failed' }, { status: 500 });
  }

  // 2. Generate a unique slug for the new proposal (per-signature record).
  const proposalSlug = `${template.source_folder}-${Date.now().toString(36).slice(-6)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

  const proposalUrl = template.public_base_url
    ? `${template.public_base_url.replace(/\/$/, '')}/${template.source_folder}/`
    : `https://cortex.nativz.io/offer/${template.source_folder}`;
  const clientAddress = payload.clientAddress ?? '';

  // 3. Render the PDF. The 'type' signature is a synthesized SVG data URL.
  const signatureDataUrl = typedSignatureToDataUrl(payload.typedSignature);
  let pdfBytes: Uint8Array;
  let proposalId: string | null = null;

  try {
    pdfBytes = await renderAgreementPdf({
      id: 'pending',
      slug: proposalSlug,
      projectName: template.name,
      projectShortName: template.name,
      proposalUrl,
      agreementTitle: template.name,
      tier: payload.tier,
      tierLabel: payload.tierLabel,
      total: Math.round(totalCents / 100),
      deposit: Math.round(depositCents / 100),
      subscription: isSubscription,
      cadence,
      clientLegalName: payload.clientLegalName,
      clientAddress,
      signerName: payload.signerName,
      signerTitle: payload.signerTitle,
      signerEmail: payload.signerEmail,
      signatureDataUrl,
      signatureMethod: 'type',
      signatureTimestamp: nowIso,
      serverTimestamp: nowIso,
      ip,
      userAgent: ua,
    });
  } catch (err) {
    console.error('[offer:sign] PDF render failed', err);
    return NextResponse.json({ ok: false, error: 'PDF generation failed' }, { status: 500 });
  }
  const pdfHash = await sha256Hex(pdfBytes);

  // 4. Insert the proposal record (status='signed' directly — the receipt).
  const { data: proposal, error: insertError } = await admin
    .from('proposals')
    .insert({
      slug: proposalSlug,
      title: template.name,
      status: 'signed',
      agency,
      template_id: template.id,
      client_id: clientId,
      tier_id: payload.tier,
      tier_label: payload.tierLabel,
      total_cents: totalCents,
      deposit_cents: depositCents,
      cadence,
      is_subscription: isSubscription,
      signer_name: payload.signerName,
      signer_email: payload.signerEmail,
      signer_title: payload.signerTitle,
      signer_legal_entity: payload.clientLegalName,
      signer_address: clientAddress || null,
      signature_method: 'type',
      signature_image: signatureDataUrl,
      pdf_sha256: pdfHash,
      pdf_bytes: pdfBytes.byteLength,
      sent_at: nowIso,
      signed_at: nowIso,
      signed_ip: ip,
      signed_user_agent: ua,
    })
    .select('id, slug')
    .single();

  if (insertError || !proposal) {
    console.error('[offer:sign] proposal insert failed', insertError);
    return NextResponse.json({ ok: false, error: 'Could not record proposal' }, { status: 500 });
  }
  proposalId = proposal.id;
  if (!proposalId) {
    return NextResponse.json({ ok: false, error: 'Proposal id missing' }, { status: 500 });
  }

  // 5. Upload PDF (path uses real proposal id now).
  const pdfStoragePath = `signed/${proposalId}.pdf`;
  const { error: uploadErr } = await admin.storage
    .from('proposal-pdfs')
    .upload(pdfStoragePath, Buffer.from(pdfBytes), {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (uploadErr) {
    console.error('[offer:sign] storage upload failed', uploadErr);
    // Non-fatal: proposal is recorded, PDF can be re-rendered.
  } else {
    await admin.from('proposals').update({ signed_pdf_path: pdfStoragePath }).eq('id', proposalId);
  }

  await admin.from('proposal_events').insert({
    proposal_id: proposalId,
    type: 'signed',
    ip,
    user_agent: ua,
    metadata: {
      tier: payload.tier,
      pdf_hash: pdfHash,
      signature_method: 'type',
      via: 'offer_link',
    },
  });

  // 6. Lifecycle: lead → contracted, log event.
  await admin
    .from('clients')
    .update({ lifecycle_state: 'contracted' })
    .eq('id', clientId)
    .eq('lifecycle_state', 'lead');
  await logLifecycleEvent(clientId, 'proposal.signed', `Proposal signed: ${template.name}`, {
    metadata: { proposal_id: proposalId, slug: proposal.slug, pdf_hash: pdfHash, via: 'offer_link' },
    admin,
  });

  // 7. Ensure flow + instantiate the tier blueprint.
  const flowResult = await ensureFlowForClient({
    clientId,
    proposalId,
    desiredStatus: 'awaiting_payment',
    createdBy: null,
    admin,
  });

  if (flowResult.ok) {
    await admin
      .from('proposals')
      .update({ onboarding_flow_id: flowResult.flow.id })
      .eq('id', proposalId);

    try {
      await instantiateBlueprintForFlow({
        admin,
        flowId: flowResult.flow.id,
        templateId: template.id,
        tierId: payload.tier,
        clientId,
      });
    } catch (err) {
      console.error('[offer:sign] blueprint instantiation failed', err);
      // Non-fatal: admin can re-instantiate from /admin/sales.
    }
  } else {
    console.error('[offer:sign] flow ensure failed', flowResult.error);
  }

  // 8. Email both parties (best-effort; non-fatal).
  const apiKey = (await getSecret('RESEND_API_KEY')) ?? '';
  if (apiKey) {
    const resend = new Resend(apiKey);
    const opsEmail = OPS_EMAIL_BY_AGENCY[agency];
    const safeName = template.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const pdfFilename = `${safeName}-Agreement-${payload.tierLabel.replace(/\s+/g, '-')}-${proposalId.slice(0, 8)}.pdf`;
    const pdfBase64 = bytesToBase64(pdfBytes);
    const stripeUrl = tier.stripe_payment_link ?? '';

    const intakeUrl = flowResult.ok
      ? `${getCortexAppUrl(agency).replace(/\/$/, '')}/onboard/${flowResult.flow.share_token}`
      : undefined;

    const clientHtml = emailClientSigned({
      signerName: payload.signerName,
      tierLabel: payload.tierLabel,
      total: Math.round(totalCents / 100),
      deposit: Math.round(depositCents / 100),
      stripeUrl,
      signerEmail: payload.signerEmail,
      id: proposalId,
      pdfHash,
      projectName: template.name,
      subscription: isSubscription,
      cadence,
      agency,
      intakeUrl,
    });
    const opsHtml = emailOpsSigned({
      clientLegalName: payload.clientLegalName,
      signerName: payload.signerName,
      signerTitle: payload.signerTitle,
      signerEmail: payload.signerEmail,
      clientAddress,
      tierLabel: payload.tierLabel,
      total: Math.round(totalCents / 100),
      deposit: Math.round(depositCents / 100),
      signedAt: nowIso,
      ip,
      ua,
      id: proposalId,
      pdfHash,
      projectName: template.name,
      subscription: isSubscription,
      cadence,
      agency,
    });
    const subjectClient = `Your ${template.name} agreement is signed (${payload.tierLabel}).`;
    const subjectOps = `[Signed via offer link · ${template.name}] ${payload.clientLegalName} · ${payload.tierLabel}`;

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
        .catch((e) => console.error('[offer:sign] client email failed', e)),
      resend.emails
        .send({
          from: getFromAddress(agency),
          replyTo: payload.signerEmail,
          to: opsEmail,
          subject: subjectOps,
          html: opsHtml,
          attachments: [{ filename: pdfFilename, content: pdfBase64 }],
        } as Parameters<Resend['emails']['send']>[0])
        .catch((e) => console.error('[offer:sign] ops email failed', e)),
    ]);
  } else {
    console.warn('[offer:sign] RESEND_API_KEY not configured — skipped emails.');
  }

  // 9. Stripe redirect. If the tier has a payment link, append client_reference_id;
  //    otherwise return null so the page shows a "thank you, payment to follow" state.
  const stripeUrl = tier.stripe_payment_link;
  const redirectUrl = stripeUrl
    ? `${stripeUrl}?prefilled_email=${encodeURIComponent(payload.signerEmail)}&client_reference_id=${proposalId}`
    : null;

  return NextResponse.json({
    ok: true,
    id: proposalId,
    slug: proposal.slug,
    pdfHash,
    redirectUrl,
    deposit: Math.round(depositCents / 100),
    total: Math.round(totalCents / 100),
    flowId: flowResult.ok ? flowResult.flow.id : null,
  });
}
