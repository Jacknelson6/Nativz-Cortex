/**
 * Infrastructure › Apify (embedded in the Cost tab).
 *
 * Reads `apify_runs` — every tracked run written by runAndLogApifyActor —
 * and rolls up spend / failures by actor over the parent tab's range.
 */

import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { Stat } from '../stat';
import { INFRA_CACHE_TAG, INFRA_CACHE_TTL } from '../cache';
import type { DateRange } from '@/lib/types/reporting';
import { presetLabel } from '@/lib/reporting/date-presets';
import type { DateRangePreset } from '@/lib/types/reporting';
import { rangeToUtcIso } from '@/lib/reporting/range-utc';

interface ActorRollup {
  actor: string;
  runs: number;
  cost: number;
  successes: number;
  failures: number;
  lastSeen: string | null;
}

const getApifyActors = unstable_cache(
  async (range: DateRange): Promise<ActorRollup[]> => {
    const admin = createAdminClient();
    const { startIso, endIso } = rangeToUtcIso(range);

    const runsRes = await admin
      .from('apify_runs')
      .select('actor_id, status, cost_usd, started_at')
      .gte('started_at', startIso)
      .lte('started_at', endIso)
      .order('started_at', { ascending: false })
      .limit(5000);

    const byActor = new Map<string, ActorRollup>();

    for (const r of runsRes.data ?? []) {
      const actor = (r as { actor_id?: string | null }).actor_id ?? 'unknown';
      const cost = Number((r as { cost_usd?: number | string | null }).cost_usd ?? 0);
      const status = (r as { status?: string | null }).status ?? 'unknown';
      const startedAt = (r as { started_at?: string | null }).started_at ?? null;

      const bucket = byActor.get(actor) ?? {
        actor,
        runs: 0,
        cost: 0,
        successes: 0,
        failures: 0,
        lastSeen: null,
      };

      bucket.runs += 1;
      bucket.cost += cost;
      if (status === 'succeeded') bucket.successes += 1;
      else if (status === 'failed' || status === 'aborted' || status === 'timed-out') {
        bucket.failures += 1;
      }
      if (startedAt && (!bucket.lastSeen || startedAt > bucket.lastSeen)) {
        bucket.lastSeen = startedAt;
      }

      byActor.set(actor, bucket);
    }

    return [...byActor.values()].sort((a, b) => b.cost - a.cost);
  },
  ['infrastructure-apify-tab-v3'],
  { revalidate: INFRA_CACHE_TTL, tags: [INFRA_CACHE_TAG] },
);

function formatUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n === 0) return '$0.00';
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

export async function ApifyTab({ range, preset }: { range: DateRange; preset: DateRangePreset }) {
  const actors = await getApifyActors(range);

  const totalRuns = actors.reduce((acc, a) => acc + a.runs, 0);
  const totalCost = actors.reduce((acc, a) => acc + a.cost, 0);
  const totalFailures = actors.reduce((acc, a) => acc + a.failures, 0);
  const failRatePct = totalRuns > 0 ? Math.round((totalFailures / totalRuns) * 100) : 0;

  const rangeLabel = presetLabel(preset).toLowerCase();

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Spend"
          value={formatUsd(totalCost)}
          sub={`${totalRuns} run${totalRuns === 1 ? '' : 's'} · ${rangeLabel}`}
        />
        <Stat
          label="Runs"
          value={String(totalRuns)}
          sub={rangeLabel}
        />
        <Stat
          label="Actors active"
          value={String(actors.length)}
          sub="Distinct actor_id"
        />
        <Stat
          label="Fail rate"
          value={`${failRatePct}%`}
          sub={`${totalFailures} failed / aborted`}
        />
      </section>

      {actors.length === 0 ? (
        <div className="rounded-xl border border-nativz-border bg-surface p-6 text-sm text-text-muted">
          No Apify runs in this range. Every Apify call should land in{' '}
          <code className="rounded bg-background/60 px-1">apify_runs</code> — if you&apos;re seeing
          Apify charges but no rows here, a caller is bypassing{' '}
          <code className="rounded bg-background/60 px-1">runAndLogApifyActor</code>.
        </div>
      ) : (
        <section className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
          <header className="flex items-center justify-between gap-3 border-b border-nativz-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-accent/70" />
              <h3 className="text-sm font-semibold text-text-primary">By actor</h3>
              <span className="font-mono text-[11px] text-text-muted">
                · {actors.length} · sorted by spend · {rangeLabel}
              </span>
            </div>
          </header>
          {/* Below md: horizontal scroll keeps the tabular layout intact
             rather than breaking the grid into an illegible stack. A
             min-w-[36rem] inner wrapper forces scroll rather than column
             crush on narrow viewports. */}
          <div className="overflow-x-auto">
            <div className="min-w-[36rem]">
              <div className="grid grid-cols-[minmax(0,1fr)_5rem_6rem_5rem_6rem] items-center gap-3 border-b border-nativz-border/40 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
                <span>Actor</span>
                <span className="text-right">Runs</span>
                <span className="text-right">Spend</span>
                <span className="text-right">Failures</span>
                <span className="text-right">Last run</span>
              </div>
              {actors.map((a) => (
                <div
                  key={a.actor}
                  className="grid grid-cols-[minmax(0,1fr)_5rem_6rem_5rem_6rem] items-center gap-3 border-b border-nativz-border/40 px-4 py-2.5 text-sm last:border-b-0"
                >
                  <span className="truncate font-mono text-[12px] text-text-primary">{a.actor}</span>
                  <span className="text-right text-xs tabular-nums text-text-secondary">{a.runs}</span>
                  <span className="text-right text-xs tabular-nums font-semibold text-text-primary">
                    {formatUsd(a.cost)}
                  </span>
                  <span
                    className={`text-right text-xs tabular-nums ${
                      a.failures > 0 ? 'text-red-300' : 'text-text-muted'
                    }`}
                  >
                    {a.failures}
                  </span>
                  <span className="text-right text-[12px] text-text-muted">
                    {formatRelative(a.lastSeen)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
