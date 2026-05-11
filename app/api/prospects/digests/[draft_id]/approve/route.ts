// SPY-10 T15: race-safe approve + send via Resend.
//
// 1. UPDATE ... WHERE status='drafted' returning row to guarantee a single
//    approver wins.
// 2. Mint a tracked CTA: insert a digest_event row (kind='sent') and a
//    second event placeholder row (kind='clicked') we use to identify the
//    click bucket; we wrap the CTA href with /r/d/<event_id>?to=<url>.
//    Simpler approach in v1: the kind='sent' event is the canonical id;
//    we use that single event_id as the redirect logger key.
// 3. Send via sendAndLog with category='system'.
// 4. Patch draft row with status='sent', sent_at, resend_message_id.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { sendAndLog } from '@/lib/email/resend';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

export const dynamic = 'force-dynamic';

interface RouteCtx {
  params: Promise<{ draft_id: string }>;
}

export async function POST(_req: Request, { params }: RouteCtx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { draft_id } = await params;

  // Race-safe transition. We rely on Postgres' returning clause via the
  // PostgREST/supabase-js select chain.
  const { data: draft, error: txnErr } = await auth.admin
    .from('prospect_digest_drafts')
    .update({
      status: 'approved',
      approved_by: auth.userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', draft_id)
    .eq('status', 'drafted')
    .select('*')
    .single();

  if (txnErr || !draft) {
    return NextResponse.json(
      { error: 'Draft is not in drafted state (already approved or expired).' },
      { status: 409 },
    );
  }

  // Mint click-tracker event row up-front so we can stamp the CTA with
  // its id before sending.
  const { data: clickEvent } = await auth.admin
    .from('prospect_digest_events')
    .insert({
      draft_id: draft.id,
      prospect_id: draft.prospect_id,
      kind: 'clicked',
      target_url: null,
    })
    .select('id')
    .single();

  let finalHtml = draft.html;
  let finalText = draft.text;
  if (clickEvent?.id) {
    const baseUrl = getCortexAppUrl('nativz');
    const ctaPattern = /href="(https?:\/\/[^"]+)"\s+class="button"/g;
    finalHtml = finalHtml.replace(ctaPattern, (_match: string, dest: string) => {
      const tracked = `${baseUrl}/r/d/${clickEvent.id}?to=${encodeURIComponent(dest)}`;
      return `href="${tracked}" class="button"`;
    });
    // Plain-text variant: replace any line that contains the original CTA
    // URL with the tracked redirect.
    finalText = finalText.replace(/https?:\/\/[^\s]+/g, (m: string) => {
      // Only wrap the first CTA-ish url; unsubscribes shouldn't be tracked
      // via /r/d. Heuristic: skip if it contains /p/digest-unsubscribe.
      if (m.includes('/p/digest-unsubscribe')) return m;
      return `${baseUrl}/r/d/${clickEvent.id}?to=${encodeURIComponent(m)}`;
    });
  }

  const sendResult = await sendAndLog({
    category: 'system',
    typeKey: 'prospect_digest',
    agency: 'nativz',
    to: draft.to_email,
    replyToOverride: draft.reply_to_email,
    fromOverride: process.env.PROSPECT_DIGEST_FROM,
    subject: draft.subject,
    html: finalHtml,
    metadata: {
      draft_id: draft.id,
      prospect_id: draft.prospect_id,
      kind: draft.kind,
    },
  });

  if (!sendResult.ok) {
    // Roll the draft back so the rep can retry.
    await auth.admin
      .from('prospect_digest_drafts')
      .update({ status: 'drafted' })
      .eq('id', draft.id);
    return NextResponse.json(
      { error: sendResult.error ?? 'Send failed' },
      { status: 500 },
    );
  }

  // Patch draft row + subscription telemetry.
  const nowIso = new Date().toISOString();
  await auth.admin
    .from('prospect_digest_drafts')
    .update({
      status: 'sent',
      sent_at: nowIso,
      resend_message_id: sendResult.messageId,
      html: finalHtml,
      text: finalText,
    })
    .eq('id', draft.id);

  await auth.admin
    .from('prospect_digest_subscriptions')
    .update({ last_sent_at: nowIso })
    .eq('id', draft.subscription_id);

  await auth.admin.from('prospect_digest_events').insert({
    draft_id: draft.id,
    prospect_id: draft.prospect_id,
    kind: 'sent',
  });

  await auth.admin.from('prospect_touchpoints').insert({
    prospect_id: draft.prospect_id,
    kind: 'email_sent',
    body: `Digest sent: ${draft.subject}`,
    metadata: {
      digest_draft_id: draft.id,
      digest_kind: draft.kind,
      resend_message_id: sendResult.messageId,
    },
  });

  return NextResponse.json({ ok: true, draft_id: draft.id });
}
