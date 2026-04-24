import type { Detector } from '../types';

/**
 * Client has a Meta ad account linked but hasn't been synced in 48h+.
 * Usually means the access token was revoked, the ad-account access was
 * pulled in Business Manager, or the daily cron is erroring on this client.
 */
export const staleMetaSyncDetector: Detector = {
  id: 'stale_meta_sync',
  severity: 'warning',
  label: 'Meta ad spend sync stale',
  rationale:
    'Auto-ingest of Meta ad spend runs daily. If a client\'s last sync is >48h old, the token probably expired or the ad-account assignment changed. Without this detector, agency thinks spend is current when it\'s frozen.',
  async detect(admin) {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data } = await admin
      .from('clients')
      .select('id, name, meta_ad_account_id, meta_ad_spend_synced_at')
      .not('meta_ad_account_id', 'is', null);
    if (!data) return [];

    return data
      .filter((c) => !c.meta_ad_spend_synced_at || c.meta_ad_spend_synced_at < cutoff)
      .map((c) => ({
        entity_type: 'client',
        entity_id: c.id,
        client_id: c.id,
        title: `${c.name}: Meta ads haven't synced in 48h+`,
        description: c.meta_ad_spend_synced_at
          ? `Last sync: ${new Date(c.meta_ad_spend_synced_at).toLocaleString('en-US')}`
          : 'Never synced.',
        metadata: {
          meta_ad_account_id: c.meta_ad_account_id,
          last_synced_at: c.meta_ad_spend_synced_at,
        },
      }));
  },
};
