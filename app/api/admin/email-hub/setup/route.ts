import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFromAddress, getReplyTo } from '@/lib/email/resend';

export const maxDuration = 10;

/**
 * Returns the configured sender identities per agency + webhook health.
 * Read-only — Resend domain verification is configured in the Resend
 * dashboard, not here.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: recentEvents } = await admin
    .from('email_webhook_events')
    .select('event_type, received_at')
    .gte('received_at', sinceIso)
    .order('received_at', { ascending: false })
    .limit(200);

  const eventBuckets: Record<string, number> = {};
  let latestEvent: string | null = null;
  for (const e of recentEvents ?? []) {
    eventBuckets[e.event_type] = (eventBuckets[e.event_type] ?? 0) + 1;
    if (!latestEvent || e.received_at > latestEvent) latestEvent = e.received_at;
  }

  const sharedSecret = Boolean(process.env.RESEND_WEBHOOK_SECRET);
  const nativzSecret = Boolean(process.env.RESEND_WEBHOOK_SECRET_NATIVZ);
  const andersonSecret = Boolean(process.env.RESEND_WEBHOOK_SECRET_ANDERSON);

  const agencies = [
    {
      key: 'nativz' as const,
      label: 'Nativz',
      from: getFromAddress('nativz'),
      replyTo: getReplyTo('nativz'),
      sendDomain: 'nativz.io',
      webhookSecretEnvVar: 'RESEND_WEBHOOK_SECRET_NATIVZ',
      webhookSecretConfigured: nativzSecret || sharedSecret,
      webhookSecretSource: nativzSecret
        ? ('dedicated' as const)
        : sharedSecret
        ? ('shared' as const)
        : ('missing' as const),
    },
    {
      key: 'anderson' as const,
      label: 'Anderson Collaborative',
      from: getFromAddress('anderson'),
      replyTo: getReplyTo('anderson'),
      sendDomain: 'andersoncollaborative.com',
      webhookSecretEnvVar: 'RESEND_WEBHOOK_SECRET_ANDERSON',
      webhookSecretConfigured: andersonSecret || sharedSecret,
      webhookSecretSource: andersonSecret
        ? ('dedicated' as const)
        : sharedSecret
        ? ('shared' as const)
        : ('missing' as const),
    },
  ];

  const env = {
    resendKeyConfigured: Boolean(process.env.RESEND_API_KEY),
    sharedWebhookSecretConfigured: sharedSecret,
    cronSecretConfigured: Boolean(process.env.CRON_SECRET),
  };

  return NextResponse.json({
    agencies,
    env,
    webhook: {
      endpoint: '/api/webhooks/resend',
      eventsLast24h: recentEvents?.length ?? 0,
      eventsByType: eventBuckets,
      latestEventAt: latestEvent,
    },
  });
}
