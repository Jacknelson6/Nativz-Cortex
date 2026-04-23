import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOnboardingAdmin } from '@/lib/onboarding/require-admin';
import { interpolateEmail } from '@/lib/onboarding/interpolate-email';
import { sendOnboardingEmail } from '@/lib/email/resend';
import { layout } from '@/lib/email/resend';
import {
  buildOnboardingBlocksHtml,
  interpolateBlocks,
  isValidBlockArray,
} from '@/lib/email/templates/onboarding-blocks';
import { resolveAgencyForRequest } from '@/lib/agency/detect';

export const dynamic = 'force-dynamic';

/**
 * POST /api/onboarding/trackers/[id]/send-email
 *
 * Fires an onboarding email template through Resend, interpolated against
 * this tracker's real client + primary contact + share URL. Accepts:
 *   - template_id (required)
 *   - to           (optional; defaults to the tracker's primary contact)
 *
 * Every attempt (success or failure) is logged to onboarding_email_sends
 * with a snapshot of the resolved subject + body, so the audit trail
 * doesn't drift if the template is later edited.
 *
 * Templates are rejected as unsendable; share_token + slug are both
 * required (no share URL means the email would contain a broken link).
 */
const Body = z.object({
  template_id: z.string().uuid(),
  to: z.string().trim().email().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: trackerId } = await params;
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin, userId } = gate;

    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
    }
    const { template_id, to: overrideTo } = parsed.data;

    // Tracker + template + primary contact — all in parallel.
    const [trackerRes, templateRes] = await Promise.all([
      admin
        .from('onboarding_trackers')
        .select('id, client_id, service, share_token, is_template, clients(name, slug)')
        .eq('id', trackerId)
        .maybeSingle(),
      admin
        .from('onboarding_email_templates')
        .select('id, service, subject, body, blocks')
        .eq('id', template_id)
        .maybeSingle(),
    ]);
    if (!trackerRes.data) return NextResponse.json({ error: 'Tracker not found' }, { status: 404 });
    if (!templateRes.data) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    const tracker = trackerRes.data;
    const template = templateRes.data;

    if (tracker.is_template) {
      return NextResponse.json({ error: "Can't send from a template tracker." }, { status: 400 });
    }
    if (template.service !== tracker.service) {
      return NextResponse.json(
        { error: `Template is for ${template.service}, tracker is ${tracker.service}.` },
        { status: 400 },
      );
    }

    // Resolve client + contact for interpolation and default recipient.
    const clientsField = (tracker as { clients: { name: string; slug: string } | { name: string; slug: string }[] | null }).clients;
    const client = Array.isArray(clientsField) ? clientsField[0] : clientsField;
    if (!client) {
      return NextResponse.json({ error: 'Tracker has no associated client.' }, { status: 400 });
    }

    let contactFirstName: string | null = null;
    let contactEmail: string | null = null;
    if (tracker.client_id) {
      const { data: contact } = await admin
        .from('contacts')
        .select('name, email, is_primary')
        .eq('client_id', tracker.client_id)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      contactFirstName = contact?.name?.trim().split(/\s+/)[0] ?? null;
      contactEmail = contact?.email ?? null;
    }

    const to = overrideTo ?? contactEmail;
    if (!to) {
      return NextResponse.json(
        { error: 'No recipient. Pass `to` in the body, or add a primary contact with an email.' },
        { status: 400 },
      );
    }

    // Build the canonical share URL from NEXT_PUBLIC_SITE_URL so we don't
    // leak localhost into a production email. Production fallback stays
    // cortex.nativz.io; AC clients should set NEXT_PUBLIC_SITE_URL to
    // their own domain.
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://cortex.nativz.io';
    const shareUrl = `${baseUrl}/onboarding/${client.slug}?token=${tracker.share_token}`;

    const ctx = {
      clientName: client.name,
      service: tracker.service,
      shareUrl,
      contactFirstName,
    };
    const resolvedSubject = interpolateEmail(template.subject, ctx);
    const agency = resolveAgencyForRequest(request);

    // If the template ships with rich blocks, prefer that path — it skips
    // markdown and uses the branded block renderer. Fall back to the
    // markdown body otherwise. We log the resolved body either way so the
    // audit trail remains useful.
    let resolvedBody: string;
    let html: string | undefined;
    const rawBlocks = (template as { blocks?: unknown }).blocks;
    if (rawBlocks && Array.isArray(rawBlocks) && rawBlocks.length > 0 && isValidBlockArray(rawBlocks)) {
      const mergeCtx: Record<string, string> = {
        client_name: ctx.clientName,
        service: ctx.service,
        share_url: ctx.shareUrl,
        contact_first_name: ctx.contactFirstName ?? 'there',
      };
      const resolvedBlocks = interpolateBlocks(rawBlocks, mergeCtx);
      const inner = buildOnboardingBlocksHtml(resolvedBlocks, agency);
      html = layout(inner, agency);
      resolvedBody = JSON.stringify(resolvedBlocks);
    } else {
      resolvedBody = interpolateEmail(template.body, ctx);
    }

    const sendResult = await sendOnboardingEmail({
      to,
      subject: resolvedSubject,
      bodyMarkdown: html ? undefined : resolvedBody,
      html,
      agency,
    });

    // Audit log: one row per attempt, success or failure.
    await admin.from('onboarding_email_sends').insert({
      tracker_id: tracker.id,
      template_id: template.id,
      sent_by: userId,
      to_email: to,
      subject: resolvedSubject,
      body: resolvedBody,
      resend_id: sendResult.ok ? sendResult.id : null,
      success: sendResult.ok,
      error: sendResult.ok ? null : sendResult.error,
    });

    if (!sendResult.ok) {
      return NextResponse.json({ error: sendResult.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, resend_id: sendResult.id, to });
  } catch (error) {
    console.error('POST /api/onboarding/trackers/[id]/send-email error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
