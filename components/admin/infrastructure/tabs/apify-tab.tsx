/**
 * Infrastructure › Apify (embedded in the Cost tab).
 *
 * Fuses two data sources:
 *   1. `apify_runs` table — every tracked run written by runAndLogApifyActor.
 *   2. Live `GET /v2/users/me` on Apify's REST API for account + monthly
 *      usage meter. Optional: tab renders on DB data alone if unreachable.
 *
 * Takes a `range` prop so the parent Cost tab's DateRangePicker drives
 * the run/spend stats. Month-bound stats (account usage, monthly limit)
 * stay calendar-month scoped because that's how Apify bills.
 */

import { unstable_cache } from 'next/cache';
import { CreditCard, Workflow, Zap } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { Stat } from '../stat';
import { SectionCard, Metric } from '../section-card';
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

interface ApifyAccount {
  username: string | null;
  plan: string | null;
  email: string | null;
  usageUsdCurrentMonth: number | null;
  usageUsdLimit: number | null;
  proxyUsageGb: number | null;
  storeUsageGb: number | null;
  computeUnitsCurrentMonth: number | null;
  lastBilledAt: string | null;
  error: string | null;
}

const getApifyData = unstable_cache(
  async (range: DateRange): Promise<{ actors: ActorRollup[]; account: ApifyAccount }> => {
    const admin = createAdminClient();
    // Pin range to admin TZ (see lib/reporting/range-utc).
    const { startIso, endIso } = rangeToUtcIso(range);

    const [runsRes, account] = await Promise.all([
      admin
        .from('apify_runs')
        .select('actor_id, status, cost_usd, started_at')
        .gte('started_at', startIso)
        .lte('started_at', endIso)
        .order('started_at', { ascending: false })
        .limit(5000),
      fetchApifyAccount(),
    ]);

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

    const actors = [...byActor.values()].sort((a, b) => b.cost - a.cost);
    return { actors, account };
  },
  ['infrastructure-apify-tab-v2'],
  { revalidate: INFRA_CACHE_TTL, tags: [INFRA_CACHE_TAG] },
);

async function fetchApifyAccount(): Promise<ApifyAccount> {
  const token = process.env.APIFY_API_KEY?.trim() || process.env.APIFY_API_TOKEN?.trim();
  const empty: ApifyAccount = {
    username: null,
    plan: null,
    email: null,
    usageUsdCurrentMonth: null,
    usageUsdLimit: null,
    proxyUsageGb: null,
    storeUsageGb: null,
    computeUnitsCurrentMonth: null,
    lastBilledAt: null,
    error: null,
  };
  if (!token) return { ...empty, error: 'APIFY_API_KEY not set' };

  try {
    const res = await fetch('https://api.apify.com/v2/users/me', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { ...empty, error: `Apify API ${res.status}` };
    const json = (await res.json()) as {
      data?: {
        username?: string;
        email?: string;
        plan?: {
          id?: string;
          description?: string;
          monthlyUsageHardLimitUsd?: number;
        };
        monthlyServiceUsage?: {
          totalUsageUsd?: number;
          totalUsageCreditsUsd?: number;
          computeUnits?: number;
          proxyUsageGbytes?: number;
          dataTransferExternalGbytes?: number;
          datasetReadsInGbytes?: number;
        };
        billingInfo?: {
          lastBilled?: string;
        };
      };
    };
    const d = json.data ?? {};
    const usage = d.monthlyServiceUsage ?? {};
    return {
      username: d.username ?? null,
      email: d.email ?? null,
      plan: d.plan?.description ?? d.plan?.id ?? null,
      usageUsdCurrentMonth: usage.totalUsageUsd ?? usage.totalUsageCreditsUsd ?? null,
      usageUsdLimit: d.plan?.monthlyUsageHardLimitUsd ?? null,
      proxyUsageGb: usage.proxyUsageGbytes ?? null,
      storeUsageGb: usage.datasetReadsInGbytes ?? null,
      computeUnitsCurrentMonth: usage.computeUnits ?? null,
      lastBilledAt: d.billingInfo?.lastBilled ?? null,
      error: null,
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : 'fetch failed' };
  }
}

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
  const { actors, account } = await getApifyData(range);

  const totalRuns = actors.reduce((acc, a) => acc + a.runs, 0);
  const totalCost = actors.reduce((acc, a) => acc + a.cost, 0);
  const totalFailures = actors.reduce((acc, a) => acc + a.failures, 0);
  const failRatePct = totalRuns > 0 ? Math.round((totalFailures / totalRuns) * 100) : 0;

  const monthPct =
    account.usageUsdCurrentMonth != null && account.usageUsdLimit
      ? Math.min(100, Math.round((account.usageUsdCurrentMonth / account.usageUsdLimit) * 100))
      : null;

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

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SectionCard
          icon={<CreditCard size={18} />}
          title={account.username ? `Account · ${account.username}` : 'Apify account'}
          sub={account.plan ?? (account.error ? 'Live account call failed' : 'Live usage from Apify API')}
          eyebrow={account.error ? 'unreachable' : 'live'}
          tone={account.error ? 'warn' : 'brand'}
        >
          {account.error ? (
            <p className="text-[12px] text-text-muted">
              {account.error}. Check <code className="rounded bg-background/60 px-1">APIFY_API_KEY</code> scope or network.
              DB-derived run cost still works below.
            </p>
          ) : (
            <div className="space-y-3">
              {account.usageUsdCurrentMonth != null && (
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] uppercase tracking-wide text-text-muted">
                      This month
                    </span>
                    <span className="text-sm tabular-nums text-text-primary">
                      {formatUsd(account.usageUsdCurrentMonth)}
                      {account.usageUsdLimit ? (
                        <span className="text-text-muted"> / {formatUsd(account.usageUsdLimit)}</span>
                      ) : null}
                    </span>
                  </div>
                  {monthPct != null && (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background/60">
                      <div
                        className={
                          'h-full transition-[width] duration-500 ' +
                          (monthPct > 90 ? 'bg-red-500' : monthPct > 70 ? 'bg-amber-400' : 'bg-emerald-400')
                        }
                        style={{ width: `${Math.max(2, monthPct)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-0.5">
                <Metric label="Email" value={account.email ?? '—'} mono />
                <Metric
                  label="Compute units (mo)"
                  value={
                    account.computeUnitsCurrentMonth != null
                      ? account.computeUnitsCurrentMonth.toFixed(2)
                      : '—'
                  }
                />
                <Metric
                  label="Proxy GB (mo)"
                  value={
                    account.proxyUsageGb != null ? account.proxyUsageGb.toFixed(2) : '—'
                  }
                />
                <Metric label="Last billed" value={formatRelative(account.lastBilledAt)} />
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          icon={<Workflow size={18} />}
          title="How spend is tracked"
          sub="Every Apify call hits runAndLogApifyActor, which writes to apify_runs."
          tone="neutral"
        >
          <ul className="space-y-2 text-[12px] text-text-muted">
            <li className="flex items-start gap-2">
              <Zap size={12} className="mt-0.5 shrink-0 text-accent-text" />
              <span>
                <code className="rounded bg-background/60 px-1">apify_runs</code> stores{' '}
                <code className="rounded bg-background/60 px-1">cost_usd</code>,{' '}
                <code className="rounded bg-background/60 px-1">compute_units</code>, and dataset counts per run.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Zap size={12} className="mt-0.5 shrink-0 text-accent-text" />
              <span>Numbers above are sums of that column within the selected range.</span>
            </li>
            <li className="flex items-start gap-2">
              <Zap size={12} className="mt-0.5 shrink-0 text-accent-text" />
              <span>
                Scraping volume knobs live in the{' '}
                <a
                  href="/admin/usage?tab=trend-finder"
                  className="text-accent-text underline decoration-dotted"
                >
                  Trend finder
                </a>{' '}
                tab.
              </span>
            </li>
          </ul>
        </SectionCard>
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
