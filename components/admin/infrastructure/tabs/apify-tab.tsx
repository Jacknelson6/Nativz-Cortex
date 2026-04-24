/**
 * Infrastructure › Apify — scraper cost, account status, per-actor breakdown.
 *
 * Two data sources fuse here:
 *   1. `apify_runs` table — every tracked run written by runAndLogApifyActor.
 *   2. Live `GET /v2/users/me` + `GET /v2/acts?my=1` on Apify's REST API —
 *      account plan, monthly-usage meter, and the list of actors we have
 *      access to. Both optional: tab renders fine on DB data alone if the
 *      API is unreachable.
 *
 * Long per-actor + per-run lists sit behind disclosures so the summary stays
 * scannable.
 */

import { unstable_cache } from 'next/cache';
import { CreditCard, Workflow, Zap } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { Stat } from '../stat';
import { Disclosure, SectionCard, Metric } from '../section-card';
import { INFRA_CACHE_TAG, INFRA_CACHE_TTL } from '../cache';

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
  async (): Promise<{ actors: ActorRollup[]; account: ApifyAccount }> => {
    const admin = createAdminClient();
    const now = Date.now();
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [runsRes, account] = await Promise.all([
      admin
        .from('apify_runs')
        .select('actor_id, status, cost_usd, started_at')
        .gte('started_at', sevenDaysAgo)
        .order('started_at', { ascending: false })
        .limit(2000),
      fetchApifyAccount(),
    ]);

    const byActor = new Map<string, ActorRollup>();

    for (const r of runsRes.data ?? []) {
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

    const actors = [...byActor.values()].sort((a, b) => b.cost7d - a.cost7d);
    return { actors, account };
  },
  ['infrastructure-apify-tab'],
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

export async function ApifyTab() {
  const { actors, account } = await getApifyData();

  const totalRuns24h = actors.reduce((acc, a) => acc + a.runs24h, 0);
  const totalRuns7d = actors.reduce((acc, a) => acc + a.runs7d, 0);
  const totalCost24h = actors.reduce((acc, a) => acc + a.cost24h, 0);
  const totalCost7d = actors.reduce((acc, a) => acc + a.cost7d, 0);
  const totalFailures7d = actors.reduce((acc, a) => acc + a.failures7d, 0);
  const failRatePct = totalRuns7d > 0 ? Math.round((totalFailures7d / totalRuns7d) * 100) : 0;

  const monthPct =
    account.usageUsdCurrentMonth != null && account.usageUsdLimit
      ? Math.min(100, Math.round((account.usageUsdCurrentMonth / account.usageUsdLimit) * 100))
      : null;

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
          label="Actors active (7d)"
          value={String(actors.length)}
          sub="Distinct actor_id"
        />
        <Stat
          label="Fail rate (7d)"
          value={`${failRatePct}%`}
          sub={`${totalFailures7d} failed / aborted`}
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
                    <span className="text-[10px] uppercase tracking-wide text-text-muted">
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
                          (monthPct > 90 ? 'bg-coral-400' : monthPct > 70 ? 'bg-amber-400' : 'bg-accent')
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
              <span>Numbers above are sums of that column — real billing, not estimates.</span>
            </li>
            <li className="flex items-start gap-2">
              <Zap size={12} className="mt-0.5 shrink-0 text-accent-text" />
              <span>
                Scraping volume knobs live in the{' '}
                <a
                  href="/admin/infrastructure?tab=trend-finder"
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
          No Apify runs in the last 7 days. Every Apify call should land in{' '}
          <code className="rounded bg-background/60 px-1">apify_runs</code> — if you&apos;re seeing
          Apify charges but no rows here, a caller is bypassing{' '}
          <code className="rounded bg-background/60 px-1">runAndLogApifyActor</code>.
        </div>
      ) : (
        <Disclosure
          summary="By actor · sorted by 7-day spend"
          count={actors.length}
          defaultOpen
        >
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] items-center gap-4 border-b border-nativz-border/40 pb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
            <span>Actor</span>
            <span className="text-right">Runs 24h</span>
            <span className="text-right">Runs 7d</span>
            <span className="text-right">Spend 24h</span>
            <span className="text-right">Spend 7d</span>
            <span className="text-right">Failures</span>
            <span className="text-right">Last run</span>
          </div>
          {actors.map((a) => (
            <div
              key={a.actor}
              className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] items-center gap-4 border-b border-nativz-border/40 py-2 text-sm last:border-b-0"
            >
              <span className="truncate font-mono text-[12px] text-text-primary">{a.actor}</span>
              <span className="text-right text-xs tabular-nums text-text-secondary">{a.runs24h}</span>
              <span className="text-right text-xs tabular-nums text-text-secondary">{a.runs7d}</span>
              <span className="text-right text-xs tabular-nums text-text-primary">
                {formatUsd(a.cost24h)}
              </span>
              <span className="text-right text-xs tabular-nums font-semibold text-text-primary">
                {formatUsd(a.cost7d)}
              </span>
              <span
                className={`text-right text-xs tabular-nums ${
                  a.failures7d > 0 ? 'text-coral-300' : 'text-text-muted'
                }`}
              >
                {a.failures7d}
              </span>
              <span className="text-right text-[11px] text-text-muted">
                {formatRelative(a.lastSeen)}
              </span>
            </div>
          ))}
        </Disclosure>
      )}
    </div>
  );
}
