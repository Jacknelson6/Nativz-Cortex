/**
 * Infrastructure › Apify — per-actor cost + run telemetry.
 *
 * Reads the `apify_runs` table (populated by lib/apify/record-run.ts and the
 * runAndLogApifyActor helper). Groups by actor so Jack can see which actor
 * is burning the budget — the 2026-04-23 $37 spike was
 * apidojo/tiktok-profile-scraper at ~$9.75, which was silently unlogged
 * before we migrated it to the tracked wrapper.
 *
 * Everything is cache-bust-safe via INFRA_CACHE_TAG — the "Refresh" button
 * on the page invalidates this alongside every other tab.
 */

import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { Stat } from '../stat';
import { INFRA_CACHE_TAG } from '../cache';

interface ActorRollup {
  actor: string;
  runs24h: number;
  runs7d: number;
  cost24h: number;
  cost7d: number;
  successes7d: number;
  failures7d: number;
  lastSeen: string | null;
}

const getApifyRollup = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const now = Date.now();
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows } = await admin
      .from('apify_runs')
      .select('actor_id, status, cost_usd, started_at')
      .gte('started_at', sevenDaysAgo)
      .order('started_at', { ascending: false })
      .limit(2000);

    const byActor = new Map<string, ActorRollup>();

    for (const r of rows ?? []) {
      const actor = (r as { actor_id?: string | null }).actor_id ?? 'unknown';
      const cost = Number((r as { cost_usd?: number | string | null }).cost_usd ?? 0);
      const status = (r as { status?: string | null }).status ?? 'unknown';
      const startedAt = (r as { started_at?: string | null }).started_at ?? null;
      const isWithin24h = startedAt ? startedAt >= twentyFourHoursAgo : false;

      const bucket = byActor.get(actor) ?? {
        actor,
        runs24h: 0,
        runs7d: 0,
        cost24h: 0,
        cost7d: 0,
        successes7d: 0,
        failures7d: 0,
        lastSeen: null,
      };

      bucket.runs7d += 1;
      bucket.cost7d += cost;
      if (isWithin24h) {
        bucket.runs24h += 1;
        bucket.cost24h += cost;
      }
      if (status === 'succeeded') bucket.successes7d += 1;
      else if (status === 'failed' || status === 'aborted' || status === 'timed-out') {
        bucket.failures7d += 1;
      }
      if (startedAt && (!bucket.lastSeen || startedAt > bucket.lastSeen)) {
        bucket.lastSeen = startedAt;
      }

      byActor.set(actor, bucket);
    }

    return [...byActor.values()].sort((a, b) => b.cost7d - a.cost7d);
  },
  ['infrastructure-apify-rollup'],
  { revalidate: 60, tags: [INFRA_CACHE_TAG] },
);

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0.00';
  if (n < 0.01) return '<$0.01';
  if (n < 10) return `$${n.toFixed(2)}`;
  if (n < 1000) return `$${n.toFixed(0)}`;
  return `$${(n / 1000).toFixed(1)}k`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export async function ApifyTab() {
  const actors = await getApifyRollup();

  const totalRuns24h = actors.reduce((acc, a) => acc + a.runs24h, 0);
  const totalRuns7d = actors.reduce((acc, a) => acc + a.runs7d, 0);
  const totalCost24h = actors.reduce((acc, a) => acc + a.cost24h, 0);
  const totalCost7d = actors.reduce((acc, a) => acc + a.cost7d, 0);
  const totalFailures7d = actors.reduce((acc, a) => acc + a.failures7d, 0);
  const failRatePct = totalRuns7d > 0 ? Math.round((totalFailures7d / totalRuns7d) * 100) : 0;

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Spend / 24h"
          value={formatUsd(totalCost24h)}
          sub={`${totalRuns24h} run${totalRuns24h === 1 ? '' : 's'}`}
        />
        <Stat
          label="Spend / 7d"
          value={formatUsd(totalCost7d)}
          sub={`${totalRuns7d} run${totalRuns7d === 1 ? '' : 's'}`}
        />
        <Stat
          label="Actors in use"
          value={String(actors.length)}
          sub="Distinct actor_id over last 7d"
        />
        <Stat
          label="Failure rate (7d)"
          value={`${failRatePct}%`}
          sub={`${totalFailures7d} failed / aborted / timed-out`}
        />
      </section>

      {actors.length === 0 ? (
        <div className="rounded-xl border border-nativz-border bg-surface p-6 text-sm text-text-muted">
          No Apify runs in the last 7 days. Every Apify call should land in{' '}
          <code className="rounded bg-background/60 px-1">apify_runs</code> — if you&apos;re seeing
          Apify charges but no rows here, a caller is bypassing{' '}
          <code className="rounded bg-background/60 px-1">runAndLogApifyActor</code>.
        </div>
      ) : (
        <section>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">
            By actor · sorted by 7-day spend
          </h3>
          <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-hover/40 text-[11px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Actor</th>
                  <th className="px-4 py-2.5 text-right font-medium">Runs 24h</th>
                  <th className="px-4 py-2.5 text-right font-medium">Runs 7d</th>
                  <th className="px-4 py-2.5 text-right font-medium">Spend 24h</th>
                  <th className="px-4 py-2.5 text-right font-medium">Spend 7d</th>
                  <th className="px-4 py-2.5 text-right font-medium">Failures</th>
                  <th className="px-4 py-2.5 text-right font-medium">Last run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nativz-border">
                {actors.map((a) => (
                  <tr key={a.actor} className="transition-colors hover:bg-surface-hover/40">
                    <td className="px-4 py-2.5 font-mono text-[12px] text-text-primary">
                      {a.actor}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
                      {a.runs24h}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
                      {a.runs7d}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-primary">
                      {formatUsd(a.cost24h)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-text-primary">
                      {formatUsd(a.cost7d)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums ${
                        a.failures7d > 0 ? 'text-coral-300' : 'text-text-muted'
                      }`}
                    >
                      {a.failures7d}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[11px] text-text-muted">
                      {formatRelative(a.lastSeen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
