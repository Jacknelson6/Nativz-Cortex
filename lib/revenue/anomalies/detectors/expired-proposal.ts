import type { Detector } from '../types';

/**
 * Proposals sitting in 'sent' or 'viewed' past their expires_at. The daily
 * reconcile cron flips them to 'expired', but if the cron hasn't run in 25h+
 * the detector catches the drift.
 */
export const expiredProposalDetector: Detector = {
  id: 'expired_proposal',
  severity: 'info',
  label: 'Proposal past expiry, not flipped',
  rationale:
    'The daily reconcile cron handles expiration, but if it hasn\'t run or errored, proposals can sit stale. Hitting this detector means the reconcile cron is probably broken — investigate cron_runs.',
  async detect(admin) {
    const now = new Date().toISOString();
    const { data } = await admin
      .from('proposals')
      .select('id, slug, title, status, expires_at, client_id')
      .in('status', ['sent', 'viewed'])
      .lt('expires_at', now)
      .limit(100);
    if (!data) return [];

    return data.map((p) => ({
      entity_type: 'proposal',
      entity_id: p.id,
      client_id: p.client_id,
      title: `${p.title}: past expiry, still '${p.status}'`,
      description: `Should have been flipped to 'expired' by /api/cron/revenue-reconcile.`,
      metadata: { slug: p.slug, expires_at: p.expires_at },
    }));
  },
};
