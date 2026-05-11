// SPY-06 T12: monitor orchestrator.
//
// One prospect → scrape its current benchmark competitors → persist
// snapshots → compute deltas vs the prior week's snapshots → write
// alerts → fire push notification on high severity. Pure-ish: this is
// the function the Workflow DevKit DurableAgent will eventually call
// step-by-step; for v1 the daily cron invokes it inline.

import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeTikTokProfile } from '@/lib/audit/scrape-tiktok-profile';
import { scrapeInstagramProfile } from '@/lib/audit/scrape-instagram-profile';
import { scrapeYouTubeProfile } from '@/lib/audit/scrape-youtube-profile';
import { scrapeFacebookProfile } from '@/lib/audit/scrape-facebook-profile';
import type { ProspectProfile, ProspectVideo } from '@/lib/audit/types';
import { getLatestBenchmark } from './benchmark-orchestrator';
import { runDeltaRules, ALERT_KIND_LABELS } from './delta-rules';
import type {
  MonitorSnapshotMetrics,
  ProspectMonitorSnapshotRow,
  ProspectPlatform,
} from './types';

export interface RunMonitorInput {
  prospectId: string;
  configId: string;
  workflowRunId?: string;
}

export interface RunMonitorResult {
  ok: boolean;
  snapshotsWritten: number;
  alertsWritten: number;
  highSeverityCount: number;
  message?: string;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function scrapePlatform(
  platform: ProspectPlatform,
  handle: string,
): Promise<{ profile: ProspectProfile; videos: ProspectVideo[] } | null> {
  const h = handle.replace(/^@/, '');
  try {
    switch (platform) {
      case 'tiktok':
        return await scrapeTikTokProfile(`https://www.tiktok.com/@${h}`);
      case 'instagram':
        return await scrapeInstagramProfile(`https://www.instagram.com/${h}/`);
      case 'youtube':
        return await scrapeYouTubeProfile(`https://www.youtube.com/@${h}`);
      case 'facebook':
        return await scrapeFacebookProfile(`https://www.facebook.com/${h}`);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function metricsFrom(
  profile: ProspectProfile,
  videos: ProspectVideo[],
): MonitorSnapshotMetrics {
  const now = Date.now();
  const last7d = videos.filter((v) => {
    if (!v.publishDate) return false;
    const t = new Date(v.publishDate).getTime();
    return Number.isFinite(t) && now - t <= WEEK_MS;
  });

  const sorted = videos
    .filter((v) => v.publishDate)
    .sort(
      (a, b) =>
        new Date(b.publishDate as string).getTime() -
        new Date(a.publishDate as string).getTime(),
    );

  const top = sorted.reduce<ProspectVideo | null>(
    (best, v) => (best == null || (v.views ?? 0) > (best.views ?? 0) ? v : best),
    null,
  );

  const last10Views = sorted.slice(0, 10).map((v) => v.views ?? 0);
  const sortedViews = [...last10Views].sort((a, b) => a - b);
  const median =
    sortedViews.length === 0
      ? 0
      : sortedViews.length % 2 === 0
        ? Math.round((sortedViews[sortedViews.length / 2 - 1] + sortedViews[sortedViews.length / 2]) / 2)
        : sortedViews[Math.floor(sortedViews.length / 2)];

  // Crude archetype: short = 'short', long = 'long', missing = null.
  const archetypeFor = (v: ProspectVideo): string | null => {
    if (v.duration == null) return null;
    if (v.duration < 30) return 'short';
    if (v.duration < 90) return 'medium';
    return 'long';
  };

  return {
    followers_count: profile.followers ?? 0,
    posts_last_7d: last7d.length,
    top_post: top
      ? {
          id: top.id,
          views: top.views ?? 0,
          published_at: top.publishDate,
          archetype: archetypeFor(top),
        }
      : null,
    archetypes_last_5: sorted.slice(0, 5).map(archetypeFor),
    median_views_last_10: median,
  };
}

interface CompetitorPick {
  platform: ProspectPlatform;
  handle: string;
}

export async function runMonitor(input: RunMonitorInput): Promise<RunMonitorResult> {
  const admin = createAdminClient();

  const benchmark = await getLatestBenchmark(input.prospectId);
  if (!benchmark) {
    await markConfigError(input.configId, 'No benchmark; pick competitors first.');
    return {
      ok: false,
      snapshotsWritten: 0,
      alertsWritten: 0,
      highSeverityCount: 0,
      message: 'No benchmark for prospect',
    };
  }

  const picks: CompetitorPick[] = (benchmark.competitors ?? [])
    .filter((c) => c.status !== 'failed')
    .map((c) => ({ platform: c.platform, handle: c.handle }));

  if (picks.length === 0) {
    await markConfigError(input.configId, 'Benchmark has no graded competitors.');
    return {
      ok: false,
      snapshotsWritten: 0,
      alertsWritten: 0,
      highSeverityCount: 0,
      message: 'No competitors',
    };
  }

  await admin
    .from('prospect_monitor_config')
    .update({ last_run_at: new Date().toISOString(), last_error: null })
    .eq('id', input.configId);

  const scraped = await Promise.all(
    picks.map(async (pick) => {
      const result = await scrapePlatform(pick.platform, pick.handle);
      return { pick, result };
    }),
  );

  let snapshotsWritten = 0;
  let alertsWritten = 0;
  let highSeverityCount = 0;
  const highBodies: string[] = [];

  for (const { pick, result } of scraped) {
    if (!result) continue;
    const metrics = metricsFrom(result.profile, result.videos);

    const { data: inserted, error: insertErr } = await admin
      .from('prospect_monitor_snapshots')
      .insert({
        prospect_id: input.prospectId,
        competitor_handle: pick.handle,
        competitor_platform: pick.platform,
        raw_metrics: metrics,
        workflow_run_id: input.workflowRunId ?? null,
      })
      .select('*')
      .single();

    if (insertErr || !inserted) continue;
    snapshotsWritten += 1;
    const curr = inserted as ProspectMonitorSnapshotRow;

    const { data: prior } = await admin
      .from('prospect_monitor_snapshots')
      .select('*')
      .eq('prospect_id', input.prospectId)
      .eq('competitor_platform', pick.platform)
      .eq('competitor_handle', pick.handle)
      .lt('captured_at', curr.captured_at)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const drafts = runDeltaRules(
      (prior as ProspectMonitorSnapshotRow | null) ?? null,
      curr,
    );

    for (const draft of drafts) {
      const { error: alertErr } = await admin
        .from('prospect_monitor_alerts')
        .insert({
          prospect_id: input.prospectId,
          snapshot_id: curr.id,
          prior_snapshot_id: prior?.id ?? null,
          kind: draft.kind,
          severity: draft.severity,
          message: draft.message,
          evidence: draft.evidence,
        });
      if (!alertErr) {
        alertsWritten += 1;
        if (draft.severity === 'high') {
          highSeverityCount += 1;
          highBodies.push(`${ALERT_KIND_LABELS[draft.kind]}: ${draft.message}`);
        }
      }
    }
  }

  await admin
    .from('prospect_monitor_config')
    .update({ last_success_at: new Date().toISOString() })
    .eq('id', input.configId);

  // Push notification fan-out. We don't yet have a generic helper in
  // lib/ so this is best-effort: post to a webhook if PUSH_NOTIFY_URL
  // is set, else log. SPY-10 will replace with a proper digest path.
  if (highSeverityCount > 0) {
    await firePushNotification(input.prospectId, highBodies);
  }

  return {
    ok: true,
    snapshotsWritten,
    alertsWritten,
    highSeverityCount,
  };
}

async function markConfigError(configId: string, error: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('prospect_monitor_config')
    .update({ last_run_at: new Date().toISOString(), last_error: error })
    .eq('id', configId);
}

async function firePushNotification(
  prospectId: string,
  bodies: string[],
): Promise<void> {
  const url = process.env.PUSH_NOTIFY_URL;
  if (!url) return;
  const truncated = bodies.join(' · ').slice(0, 280);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospect_id: prospectId,
        title: 'Competitor alert',
        body: truncated,
      }),
    });
  } catch (err) {
    console.error('[monitor-orchestrator] push fire failed', err);
  }
}
