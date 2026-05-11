// SPY-10 T05: build the structured payload for a weekly_competitor digest.
//
// Pulls the last 7 days of high-severity alerts from `prospect_monitor_alerts`
// (SPY-06) and condenses them into the top 3 highlight items. If there are no
// high-severity alerts in the window, returns null so the orchestrator can
// skip the build (no empty digests per PRD edge case).

import { createAdminClient } from '@/lib/supabase/admin';
import type { WeeklyCompetitorPayload } from './types';

function fmtMessageHeadline(message: string): string {
  // Strip excess whitespace + clamp to 100 chars.
  const s = message.replace(/\s+/g, ' ').trim();
  return s.length > 100 ? `${s.slice(0, 97)}...` : s;
}

function fmtBody(evidence: Record<string, unknown>, message: string): string {
  const note =
    typeof evidence?.note === 'string' && evidence.note.trim().length > 0
      ? (evidence.note as string)
      : message;
  const s = note.replace(/\s+/g, ' ').trim();
  return s.length > 240 ? `${s.slice(0, 237)}...` : s;
}

export interface BuildWeeklyCompetitorPayloadInput {
  prospectId: string;
  ctaUrl: string;
  now?: Date;
}

export async function buildWeeklyCompetitorPayload(
  input: BuildWeeklyCompetitorPayloadInput,
): Promise<WeeklyCompetitorPayload | null> {
  const admin = createAdminClient();
  const now = input.now ?? new Date();
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const { data: alerts } = await admin
    .from('prospect_monitor_alerts')
    .select('id, kind, severity, message, evidence, occurred_at, snapshot_id')
    .eq('prospect_id', input.prospectId)
    .eq('severity', 'high')
    .gte('occurred_at', from.toISOString())
    .order('occurred_at', { ascending: false })
    .limit(20);

  if (!alerts || alerts.length === 0) {
    return null;
  }

  // Pull competitor identity from snapshot when available; otherwise blank.
  const snapshotIds = Array.from(
    new Set(alerts.map((a) => a.snapshot_id).filter((x): x is string => !!x)),
  );
  const snapshotIdToCompetitor = new Map<
    string,
    { handle: string; platform: string }
  >();
  if (snapshotIds.length > 0) {
    const { data: snapshots } = await admin
      .from('prospect_monitor_snapshots')
      .select('id, competitor_handle, competitor_platform')
      .in('id', snapshotIds);
    for (const row of snapshots ?? []) {
      snapshotIdToCompetitor.set(row.id, {
        handle: row.competitor_handle ?? '',
        platform: row.competitor_platform ?? '',
      });
    }
  }

  const top = alerts.slice(0, 3);
  const highlights = top.map((a) => {
    const comp = a.snapshot_id ? snapshotIdToCompetitor.get(a.snapshot_id) : null;
    const evidence = (a.evidence ?? {}) as Record<string, unknown>;
    return {
      competitor_handle: comp?.handle ?? 'competitor',
      competitor_platform: comp?.platform ?? '',
      headline: fmtMessageHeadline(a.message ?? ''),
      body: fmtBody(evidence, a.message ?? ''),
      alert_id: a.id,
    };
  });

  return {
    highlights,
    week_range: {
      from: from.toISOString().slice(0, 10),
      to: now.toISOString().slice(0, 10),
    },
    cta_url: input.ctaUrl,
  };
}
