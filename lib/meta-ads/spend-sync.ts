/**
 * Meta Marketing API spend sync. Assumes a single agency-partner access
 * token (`META_APP_ACCESS_TOKEN` in env, or a System User long-lived token)
 * that has been granted read access on each client's ad account via Business
 * Manager. Per client, we only need the ad account id — the token is shared.
 *
 * Pulls daily insights at `level=campaign`, aggregates to monthly buckets,
 * and upserts into `client_ad_spend` with `source='meta_api'`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

const GRAPH_VERSION = 'v25.0';

type InsightRow = {
  date_start: string;
  date_stop: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  account_currency?: string;
};

type InsightsResponse = {
  data: InsightRow[];
  paging?: { next?: string };
  error?: { message: string; type: string; code: number };
};

export async function syncMetaAdSpendForClient(
  clientId: string,
  admin: SupabaseClient = createAdminClient(),
  opts: { sinceIso?: string; untilIso?: string; token?: string } = {},
): Promise<{
  ok: true;
  rows: number;
  months: number;
} | { ok: false; error: string }> {
  const token = opts.token ?? process.env.META_APP_ACCESS_TOKEN;
  if (!token) return { ok: false, error: 'META_APP_ACCESS_TOKEN is not configured.' };

  const { data: client } = await admin
    .from('clients')
    .select('id, meta_ad_account_id')
    .eq('id', clientId)
    .maybeSingle();
  if (!client?.meta_ad_account_id) {
    return { ok: false, error: 'Client has no meta_ad_account_id set.' };
  }

  const since = opts.sinceIso ?? new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const until = opts.untilIso ?? new Date().toISOString().slice(0, 10);
  const accountId = normalizeAccountId(client.meta_ad_account_id);

  // Token goes in the Authorization header, not query string, so it doesn't
  // leak into server/proxy logs. Pagination `paging.next` URLs come back
  // without a token and are hit with the same header.
  const firstUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/act_${accountId}/insights`);
  firstUrl.searchParams.set('level', 'campaign');
  firstUrl.searchParams.set('time_increment', '1');
  firstUrl.searchParams.set('time_range', JSON.stringify({ since, until }));
  firstUrl.searchParams.set(
    'fields',
    'spend,campaign_id,campaign_name,account_currency,date_start,date_stop',
  );
  firstUrl.searchParams.set('limit', '500');

  const allRows: InsightRow[] = [];
  let next: string | null = firstUrl.toString();
  let pages = 0;
  while (next && pages < 50) {
    pages += 1;
    // Strip any access_token that Meta might have baked into paging.next; we
    // send the token via header so the URL should not carry it on any page.
    const stripped = stripAccessTokenParam(next);
    const res = await fetch(stripped, {
      headers: { authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as InsightsResponse;
    if (json.error) return { ok: false, error: `Meta API: ${json.error.message}` };
    allRows.push(...(json.data ?? []));
    next = json.paging?.next ?? null;
  }

  type Bucket = { cents: number; campaigns: Set<string>; currency: string };
  const byCampaignMonth = new Map<string, Bucket>();
  for (const r of allRows) {
    const day = r.date_start;
    if (!day) continue;
    const month = `${day.slice(0, 7)}-01`;
    const campaign = r.campaign_name ?? r.campaign_id ?? '(unnamed)';
    const key = `${campaign}::${month}`;
    const cents = dollarsStringToCents(r.spend ?? '0');
    const existing = byCampaignMonth.get(key);
    if (existing) {
      existing.cents += cents;
    } else {
      byCampaignMonth.set(key, {
        cents,
        campaigns: new Set([campaign]),
        currency: (r.account_currency ?? 'USD').toLowerCase(),
      });
    }
  }

  let upsertCount = 0;
  const months = new Set<string>();
  for (const [key, bucket] of byCampaignMonth) {
    const [campaign, month] = key.split('::');
    months.add(month);
    const { error } = await admin.from('client_ad_spend').upsert(
      {
        client_id: clientId,
        platform: 'meta',
        campaign_label: campaign,
        period_month: month,
        spend_cents: bucket.cents,
        source: 'meta_api',
      },
      { onConflict: 'client_id,platform,campaign_label,period_month' },
    );
    if (!error) upsertCount += 1;
  }

  await admin
    .from('clients')
    .update({ meta_ad_spend_synced_at: new Date().toISOString() })
    .eq('id', clientId);

  return { ok: true, rows: upsertCount, months: months.size };
}

function normalizeAccountId(raw: string): string {
  return raw.startsWith('act_') ? raw.slice(4) : raw;
}

function stripAccessTokenParam(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.searchParams.delete('access_token');
    return u.toString();
  } catch {
    return rawUrl;
  }
}

function dollarsStringToCents(spend: string): number {
  const n = parseFloat(spend);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
