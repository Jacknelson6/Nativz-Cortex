import type { Detector } from '../types';

/**
 * Stripe event received but never processed. One of these sitting for >10min
 * means the dispatch failed and the event body is waiting in stripe_events
 * for replay. Every unprocessed event is money-adjacent state that hasn't
 * landed in Cortex.
 */
export const webhookBacklogDetector: Detector = {
  id: 'webhook_backlog',
  severity: 'error',
  label: 'Unprocessed Stripe webhook',
  rationale:
    'A Stripe event landed in stripe_events but processed_at is still null after 10+ minutes. Likely a crash or unhandled branch in the webhook dispatcher. Look at processing_error + consider replaying via stripe.events.retrieve.',
  async detect(admin) {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data } = await admin
      .from('stripe_events')
      .select('id, type, received_at, processing_error')
      .is('processed_at', null)
      .lt('received_at', cutoff)
      .limit(50);
    if (!data) return [];

    return data.map((e) => ({
      entity_type: 'stripe_event',
      entity_id: e.id,
      client_id: null,
      title: `${e.type} unprocessed ${humanAgo(e.received_at)}`,
      description: e.processing_error
        ? `Last error: ${e.processing_error}`
        : 'No processing_error set — the dispatcher may have crashed silently.',
      metadata: { received_at: e.received_at, processing_error: e.processing_error },
    }));
  },
};

function humanAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
