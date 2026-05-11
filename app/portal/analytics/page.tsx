// ZNA-02: portal mirror of the admin growth chart page. Single brand,
// scoped via getPortalClient(). No brand pill, no clientId in the URL.

import { redirect } from 'next/navigation';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadZernioTimeseries } from '@/lib/analytics/zernio-timeseries';
import { computeDelta } from '@/lib/analytics/zernio-delta';
import { ZernioPlatformCard } from '@/components/analytics/zernio-platform-card';
import { ZernioPulseMount } from '@/components/analytics/zernio-pulse-mount';
import type { PulseShape } from '@/components/analytics/zernio-pulse-card';
import type { AnalyticsPlatform, RangeKey } from '@/lib/analytics/types';

export const dynamic = 'force-dynamic';

const ORDER: AnalyticsPlatform[] = ['tiktok', 'instagram', 'youtube', 'facebook'];

interface SearchParams {
  range?: string;
}

function parseRange(v: string | undefined): RangeKey {
  if (v === '7d' || v === '30d' || v === '90d' || v === 'all') return v;
  return '30d';
}

export default async function PortalAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const portal = await getPortalClient();
  if (!portal) redirect('/login');

  const range = parseRange(params.range);
  const admin = createAdminClient();
  const clientId = portal.client.id;

  const { data: profiles } = await admin
    .from('social_profiles')
    .select('id, platform, is_active')
    .eq('client_id', clientId)
    .eq('is_active', true);

  const activePlatforms = ORDER.filter((p) =>
    (profiles ?? []).some((row) => row.platform === p && row.is_active),
  );

  const cards = await Promise.all(
    activePlatforms.map(async (platform) => {
      const ts = await loadZernioTimeseries({
        supabase: admin,
        clientId,
        platform,
        range,
      });
      const delta = computeDelta({ points: ts.points, range, metric: 'followers' });
      return { platform, ts, delta };
    }),
  );

  const today = new Date().toISOString().slice(0, 10);
  const { data: pulseRow } = await admin
    .from('client_analytics_pulses')
    .select(
      'id, client_id, organization_id, pulse_date, generated_at, body, signal_metric, signal_value, platforms_referenced, referenced_post_ids, is_dismissed, is_locked',
    )
    .eq('client_id', clientId)
    .eq('pulse_date', today)
    .maybeSingle();
  const pulse: PulseShape | null =
    pulseRow && !pulseRow.is_dismissed && pulseRow.organization_id === portal.organizationId
      ? (pulseRow as PulseShape)
      : null;

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Growth</h1>
        <p className="text-sm text-white/60 mt-1">
          Daily snapshot of your followers, views, and engagements per platform.
        </p>
      </div>
      <ZernioPulseMount initial={pulse} clientId={clientId} isPortal />
      {cards.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-surface p-8 text-center">
          <div className="text-sm font-medium">No connected platforms yet</div>
          <div className="text-xs text-white/50 mt-1">Your team will connect Zernio shortly.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {cards.map(({ platform, ts, delta }) => (
            <ZernioPlatformCard
              key={platform}
              clientId={clientId}
              platform={platform}
              initial={ts}
              initialDelta={delta}
              initialRange={range}
              isPortal
            />
          ))}
        </div>
      )}
    </div>
  );
}
