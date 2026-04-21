import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSecret } from '@/lib/secrets/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

/**
 * Resend event webhook. Ingests delivery/open/click/bounce/complain events
 * and updates the corresponding row in email_messages (matched by resend_id).
 * Also archives every payload in email_webhook_events for debugging.
 *
 * Signature verification: Resend signs with Svix. The raw body + headers
 * `svix-id`, `svix-timestamp`, `svix-signature` form an HMAC-SHA256 with the
 * base64-decoded secret (stripped of the `whsec_` prefix).
 *
 * We support multiple signing secrets so Jack can register one webhook per
 * Resend domain (Nativz + Anderson). The handler tries every configured
 * secret and accepts if any validates. Env vars (all optional):
 *   - RESEND_WEBHOOK_SECRET            (single-endpoint fallback)
 *   - RESEND_WEBHOOK_SECRET_NATIVZ     (nativz.io endpoint)
 *   - RESEND_WEBHOOK_SECRET_ANDERSON   (andersoncollaborative.com endpoint)
 * If none are set we accept the event and log a warning.
 */

type ResendEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string | string[];
    from?: string;
    subject?: string;
    bounce?: { type?: string; message?: string };
    click?: { link?: string };
    [key: string]: unknown;
  };
};

async function getConfiguredSecrets(): Promise<string[]> {
  const [shared, nativz, anderson] = await Promise.all([
    getSecret('RESEND_WEBHOOK_SECRET'),
    getSecret('RESEND_WEBHOOK_SECRET_NATIVZ'),
    getSecret('RESEND_WEBHOOK_SECRET_ANDERSON'),
  ]);
  return [shared, nativz, anderson].filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );
}

function verifyWithSecret(
  rawBody: string,
  id: string,
  ts: string,
  sig: string,
  secret: string,
): boolean {
  const key = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const keyBytes = Buffer.from(key, 'base64');
  const signed = `${id}.${ts}.${rawBody}`;
  const expected = createHmac('sha256', keyBytes).update(signed).digest('base64');
  const candidates = sig
    .split(' ')
    .map((s) => s.split(',')[1])
    .filter(Boolean);
  for (const candidate of candidates) {
    const a = Buffer.from(candidate, 'base64');
    const b = Buffer.from(expected, 'base64');
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

async function verifySvixSignature(rawBody: string, headers: Headers): Promise<boolean> {
  const id = headers.get('svix-id');
  const ts = headers.get('svix-timestamp');
  const sig = headers.get('svix-signature');
  if (!id || !ts || !sig) return false;

  for (const secret of await getConfiguredSecrets()) {
    if (verifyWithSecret(rawBody, id, ts, sig, secret)) return true;
  }
  return false;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const secrets = await getConfiguredSecrets();
  let signatureValid = true;
  if (secrets.length > 0) {
    signatureValid = await verifySvixSignature(rawBody, request.headers);
    if (!signatureValid) {
      // Log the rejected attempt so Setup can show "Resend is reaching us but
      // the secret is stale" — without it, admins can't tell a misconfigured
      // webhook from a disconnected one.
      console.warn('[resend-webhook] signature check failed against all configured secrets');
      const admin = createAdminClient();
      let partialEvent: { type?: string; data?: { email_id?: string } } = {};
      try {
        partialEvent = JSON.parse(rawBody);
      } catch {
        /* body isn't JSON — still worth logging the attempt */
      }
      await admin.from('email_webhook_events').insert({
        event_type: partialEvent.type ?? 'unknown',
        resend_id: partialEvent.data?.email_id ?? null,
        payload: { rejected: 'signature_invalid', raw_body_length: rawBody.length },
        signature_valid: false,
      });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[resend-webhook] no webhook secrets configured — accepting unsigned event',
    );
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const resendId = event.data?.email_id ?? null;
  const admin = createAdminClient();

  await admin.from('email_webhook_events').insert({
    event_type: event.type,
    resend_id: resendId,
    payload: event as unknown as Record<string, unknown>,
  });

  if (!resendId) {
    return NextResponse.json({ ok: true, note: 'no email_id in payload' });
  }

  const { data: message } = await admin
    .from('email_messages')
    .select('id, open_count, click_count')
    .eq('resend_id', resendId)
    .maybeSingle();

  if (!message) {
    return NextResponse.json({ ok: true, note: 'no matching email_message' });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };

  switch (event.type) {
    case 'email.sent':
      patch.status = 'sent';
      patch.sent_at = now;
      break;
    case 'email.delivered':
      patch.status = 'delivered';
      patch.delivered_at = now;
      break;
    case 'email.delivery_delayed':
      break;
    case 'email.opened':
      patch.opened_at = message.open_count === 0 ? now : undefined;
      patch.last_opened_at = now;
      patch.open_count = (message.open_count ?? 0) + 1;
      break;
    case 'email.clicked':
      patch.clicked_at = message.click_count === 0 ? now : undefined;
      patch.last_clicked_at = now;
      patch.click_count = (message.click_count ?? 0) + 1;
      break;
    case 'email.bounced':
      patch.status = 'bounced';
      patch.bounced_at = now;
      patch.failure_reason = event.data?.bounce?.message ?? 'bounced';
      break;
    case 'email.complained':
      patch.status = 'complained';
      patch.unsubscribed_at = now;
      break;
    case 'email.failed':
      patch.status = 'failed';
      patch.failed_at = now;
      patch.failure_reason = (event.data as { error?: string } | undefined)?.error ?? 'failed';
      break;
    default:
      break;
  }

  // Strip undefined so we don't null out existing values
  const cleanPatch = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));

  await admin.from('email_messages').update(cleanPatch).eq('id', message.id);

  // Mirror bounce/complaint onto contact row so future sends skip.
  if (event.type === 'email.bounced' || event.type === 'email.complained') {
    const { data: full } = await admin
      .from('email_messages')
      .select('contact_id')
      .eq('id', message.id)
      .maybeSingle();
    if (full?.contact_id) {
      const contactPatch: Record<string, unknown> = { updated_at: now };
      if (event.type === 'email.bounced') contactPatch.bounced_at = now;
      if (event.type === 'email.complained') {
        contactPatch.complained_at = now;
        contactPatch.subscribed = false;
        contactPatch.unsubscribed_at = now;
      }
      await admin.from('email_contacts').update(contactPatch).eq('id', full.contact_id);
    }
  }

  // Link the stored webhook event to the message row we updated.
  await admin
    .from('email_webhook_events')
    .update({ email_message_id: message.id })
    .eq('resend_id', resendId)
    .is('email_message_id', null);

  return NextResponse.json({ ok: true });
}
