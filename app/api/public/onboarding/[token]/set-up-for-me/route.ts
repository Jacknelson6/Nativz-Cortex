/**
 * /api/public/onboarding/[token]/set-up-for-me
 *
 * Client-triggered: ping the agency ops inbox when the client clicks
 * "Set up for me" on a per-platform row of the social_connect screen.
 * The ops inbox pulls that thread off and reaches out to whoever owns
 * platform handoffs so the client doesn't need to do the OAuth dance
 * themselves.
 *
 * POST { platform: string, note?: string }
 *
 * The step_state social_handles.connections[platform].status is set to
 * 'set_up_for_me' on the same call so the screen reflects the request
 * immediately.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOnboardingByToken, logEmail, patchStepState } from '@/lib/onboarding/api';
import { layout, sendAndLog } from '@/lib/email/resend';
import { getTheme } from '@/lib/branding';
import { getBrandFromAgency } from '@/lib/agency/detect';
import type { SocialHandlesState } from '@/lib/onboarding/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const InputSchema = z.object({
  platform: z.string().min(1).max(50),
  note: z.string().max(2000).optional().nullable(),
});

function escape(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const row = await getOnboardingByToken(token);
  if (!row || row.status === 'abandoned') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (row.kind !== 'smm') {
    return NextResponse.json({ error: 'set-up-for-me is SMM-only' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Resolve client + agency for routing the email.
  const admin = createAdminClient();
  const { data: clientRow } = await admin
    .from('clients')
    .select('id, name, agency')
    .eq('id', row.client_id)
    .single<{ id: string; name: string | null; agency: string | null }>();
  if (!clientRow) {
    return NextResponse.json({ error: 'client missing' }, { status: 404 });
  }
  const agency = getBrandFromAgency(clientRow.agency);
  const theme = getTheme(agency);
  const to = theme.opsEmail ?? theme.supportEmail;
  const clientName = clientRow.name ?? 'A client';

  // Patch step_state so the UI updates immediately.
  const social = (row.step_state.social_handles as SocialHandlesState | undefined) ?? {};
  const connections = social.connections ?? {};
  const merged: SocialHandlesState = {
    ...social,
    connections: {
      ...connections,
      [parsed.data.platform]: {
        ...connections[parsed.data.platform],
        status: 'set_up_for_me',
      },
    },
  };
  await patchStepState(row.id, { social_handles: merged });

  // Email ops.
  const subject = `[${theme.shortName}] ${clientName} asked us to set up ${parsed.data.platform}`;
  const note = parsed.data.note?.trim()
    ? `<p class="subtext"><em>"${escape(parsed.data.note.trim())}"</em></p>`
    : '';
  const adminLink = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://cortex.nativz.io'}/admin/onboarding/${row.id}`;

  const html = layout(
    `
    <p class="subtext">${escape(clientName)} clicked "Set up for me" for <strong>${escape(parsed.data.platform)}</strong> on their onboarding.</p>
    ${note}
    <p class="subtext">Reach out and walk them through the handoff so we can wire up the account on their behalf.</p>
    <div class="button-wrap" style="text-align:center;">
      <a href="${adminLink}" class="button">Open in Cortex</a>
    </div>
  `,
    agency,
    {
      eyebrow: 'Action needed',
      heroTitle: `${clientName} needs help with ${parsed.data.platform}`,
    },
  );

  const sent = await sendAndLog({
    category: 'transactional',
    typeKey: 'onboarding_set_up_for_me',
    agency,
    to,
    recipientName: null,
    subject,
    html,
    clientId: row.client_id,
    metadata: {
      onboarding_id: row.id,
      platform: parsed.data.platform,
    },
  });

  await logEmail({
    onboarding_id: row.id,
    kind: 'manual',
    to_email: to,
    subject,
    body_preview: `Set-up-for-me request: ${parsed.data.platform}`,
    resend_id: sent.messageId,
    ok: sent.ok,
    error: sent.error ?? null,
    triggered_by: null,
  });

  return NextResponse.json({ ok: true });
}
