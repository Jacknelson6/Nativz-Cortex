/**
 * Infrastructure › Compute — Vercel monitoring only.
 *
 * Strict scope: uptime, new deployments, and a live runtime log stream.
 * No cards for the running env or URLs (both live one click away on the
 * Vercel dashboard). No disclosure/collapse on anything — you land here,
 * you see everything.
 *
 * Contents, top → bottom:
 *   1. Top strip: uptime · environment · latest deploy · deployments count
 *   2. Recent deployments table (always open, fixed-width right columns so
 *      alignment doesn't drift with commit-message length)
 *   3. Live log stream (polls Vercel's events API every 3s, no click to open)
 *
 * Note: Vercel's observability charts (Edge Requests, Fast Data Transfer,
 * Functions error rate, Active CPU) are not exposed on their public REST
 * API with a project-scoped token — those endpoints 404. A single prominent
 * "Open observability in Vercel" link in the header surfaces them one click
 * away rather than faking charts with unrelated data.
 */

import { unstable_cache } from 'next/cache';
import {
  ArrowUpRight,
  GitBranch,
  Rocket,
  ScrollText,
  BarChart3,
} from 'lucide-react';
import { Stat } from '../stat';
import { INFRA_CACHE_TAG, INFRA_CACHE_TTL } from '../cache';
import { LiveLogStream } from '../live-log-stream';

interface VercelDeployment {
  uid: string;
  name: string;
  url: string;
  state: string;
  readyState?: string;
  createdAt: number;
  buildingAt?: number;
  ready?: number;
  target?: string | null;
  inspectorUrl?: string;
  meta?: {
    githubCommitSha?: string;
    githubCommitRef?: string;
    githubCommitMessage?: string;
    githubCommitAuthorName?: string;
  };
}

interface VercelRollup {
  hasToken: boolean;
  projectId: string | null;
  teamId: string | null;
  deployments: VercelDeployment[];
  error: string | null;
}

async function fetchVercelDeployments(): Promise<VercelRollup> {
  const token = process.env.VERCEL_TOKEN?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim() || null;
  const teamId = process.env.VERCEL_ORG_ID?.trim() || process.env.VERCEL_TEAM_ID?.trim() || null;

  if (!token) {
    return { hasToken: false, projectId, teamId, deployments: [], error: null };
  }

  try {
    // Vercel's deployment list is slow when the project has many builds —
    // 6s was regularly tripping the abort. 20s matches the list-tab
    // expectation and is still well under the function's 300s ceiling.
    const params = new URLSearchParams({ limit: '20' });
    if (projectId) params.set('projectId', projectId);
    if (teamId) params.set('teamId', teamId);
    const res = await fetch(`https://api.vercel.com/v6/deployments?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        hasToken: true,
        projectId,
        teamId,
        deployments: [],
        error: `Vercel API ${res.status}${body ? ': ' + body.slice(0, 180) : ''}`,
      };
    }
    const data = (await res.json()) as { deployments?: VercelDeployment[] };
    return { hasToken: true, projectId, teamId, deployments: data.deployments ?? [], error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetch failed';
    // Translate the opaque AbortError into something the UI can explain
    // without pointing the user at the wrong env var.
    const isTimeout =
      err instanceof Error &&
      (err.name === 'TimeoutError' ||
        err.name === 'AbortError' ||
        /aborted|timed out/i.test(err.message));
    return {
      hasToken: true,
      projectId,
      teamId,
      deployments: [],
      error: isTimeout
        ? 'Vercel deployments API timed out (20s). Usually transient — try Refresh.'
        : message,
    };
  }
}

const getComputeRollup = unstable_cache(
  async () => {
    const vercel = await fetchVercelDeployments();
    return { vercel };
  },
  ['infrastructure-compute-rollup-v3'],
  { revalidate: INFRA_CACHE_TTL, tags: [INFRA_CACHE_TAG] },
);

function formatAge(iso: number | string | null | undefined): string {
  if (!iso) return '—';
  const ts = typeof iso === 'number' ? iso : new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '—';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

function stateTone(state: string): string {
  const s = state.toLowerCase();
  if (s === 'ready') return 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (s === 'error' || s === 'canceled')
    return 'border border-red-500/30 bg-red-500/10 text-red-300';
  if (s === 'building' || s === 'queued' || s === 'initializing')
    return 'border border-amber-500/30 bg-amber-500/10 text-amber-300';
  return 'border border-text-muted/30 bg-surface-hover/60 text-text-secondary';
}

function teamSlugOf(teamId: string | null): string | null {
  if (!teamId) return null;
  // Stable internal mapping — avoids a round-trip to /v2/teams/{id} on
  // every render just to resolve a display slug.
  if (teamId === 'team_0vyaJsvD9Q8NOFTD8K1di8BB') return 'anderson-collaborative';
  return teamId;
}

function deploymentLogsUrl(d: VercelDeployment, teamId: string | null): string {
  if (d.inspectorUrl) return `${d.inspectorUrl.replace(/\/$/, '')}/logs`;
  const slug = teamSlugOf(teamId);
  return `https://vercel.com/${slug ?? 'dashboard'}/nativz-cortex/${d.uid}/logs`;
}

export async function ComputeTab() {
  const { vercel } = await getComputeRollup();

  const env = process.env.VERCEL_ENV ?? 'local';
  const region = process.env.VERCEL_REGION ?? 'local';
  const productionUrl = 'https://cortex.nativz.io';

  const latest = vercel.deployments[0] ?? null;
  const prod = vercel.deployments.find((d) => d.target === 'production') ?? null;

  const prodState = prod ? prod.state.toLowerCase() : 'unknown';
  const uptimeValue =
    prodState === 'ready'
      ? 'online'
      : prodState === 'error' || prodState === 'canceled'
        ? 'degraded'
        : prodState;

  const slug = teamSlugOf(vercel.teamId);
  const observabilityUrl = slug ? `https://vercel.com/${slug}/nativz-cortex/observability` : null;
  const deploysUrl = slug
    ? `https://vercel.com/${slug}/nativz-cortex/deployments`
    : 'https://vercel.com/dashboard';
  const logsUrl = slug ? `https://vercel.com/${slug}/nativz-cortex/logs` : null;

  // Pick which deploy to stream logs from. Prefer production ready; fall
  // back to the newest deploy. No log stream when there's no token.
  const streamTarget = prod ?? latest;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Uptime"
          value={uptimeValue.toUpperCase()}
          sub={prod ? `${prod.target} · ${formatAge(prod.createdAt)}` : productionUrl.replace('https://', '')}
        />
        <Stat
          label="Environment"
          value={env.toUpperCase()}
          sub={region !== 'local' ? `region · ${region}` : 'running locally'}
        />
        <Stat
          label="Latest deploy"
          value={latest ? formatAge(latest.createdAt) : '—'}
          sub={latest?.state.toLowerCase() ?? 'no telemetry'}
        />
        <Stat
          label="Deployments (recent)"
          value={`${vercel.deployments.length}`}
          sub={vercel.hasToken ? 'Vercel API connected' : 'Connect Vercel for live data'}
        />
      </section>

      {/* Quick access to Vercel's own dashboards — the observability tile charts
          (Edge Requests, Fast Data Transfer, Functions, Compute) aren't exposed
          on the public REST API, so we deep-link instead of faking them here. */}
      {vercel.hasToken && (
        <div className="flex flex-wrap items-center gap-2">
          {observabilityUrl && (
            <a
              href={observabilityUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 text-xs font-medium text-accent-text transition-colors hover:bg-accent/15"
            >
              <BarChart3 size={12} />
              Observability in Vercel
              <ArrowUpRight size={11} />
            </a>
          )}
          <a
            href={deploysUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-nativz-border bg-surface px-3.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-nativz-border/90 hover:text-text-primary"
          >
            <Rocket size={12} />
            All deployments
            <ArrowUpRight size={11} />
          </a>
          {logsUrl && (
            <a
              href={logsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-nativz-border bg-surface px-3.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-nativz-border/90 hover:text-text-primary"
            >
              <ScrollText size={12} />
              Full log viewer
              <ArrowUpRight size={11} />
            </a>
          )}
        </div>
      )}

      {/* Recent deployments — always open, fixed-width right columns so
          Build/Age/State/Logs line up regardless of commit-message width. */}
      {vercel.hasToken ? (
        vercel.error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
            {vercel.error}
            {!/timed out|aborted/i.test(vercel.error) ? (
              <span className="text-text-muted">
                {' '}Token may lack read scope, or{' '}
                <code className="rounded bg-background/60 px-1">VERCEL_PROJECT_ID</code> is missing.
              </span>
            ) : null}
          </div>
        ) : vercel.deployments.length > 0 ? (
          <section className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
            <header className="flex items-center justify-between gap-3 border-b border-nativz-border/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-accent/70" />
                <h2 className="text-sm font-semibold text-text-primary">Recent deployments</h2>
                <span className="font-mono text-[11px] text-text-muted">
                  · {vercel.deployments.length} · Vercel API
                </span>
              </div>
            </header>
            <div className="grid grid-cols-[6rem_minmax(0,1fr)_4rem_5rem_5.5rem_4.5rem] items-center gap-3 border-b border-nativz-border/40 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
              <span>Target</span>
              <span>Branch · commit</span>
              <span className="text-right">Build</span>
              <span className="text-right">Age</span>
              <span className="text-right">State</span>
              <span className="text-right">Logs</span>
            </div>
            {vercel.deployments.map((d) => {
              const build = d.ready != null && d.buildingAt != null ? d.ready - d.buildingAt : null;
              return (
                <div
                  key={d.uid}
                  className="grid grid-cols-[6rem_minmax(0,1fr)_4rem_5rem_5.5rem_4.5rem] items-center gap-3 border-b border-nativz-border/40 px-4 py-2.5 text-sm last:border-b-0"
                >
                  <span
                    className={
                      'justify-self-start rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ' +
                      (d.target === 'production'
                        ? 'bg-accent/15 text-accent-text'
                        : 'bg-surface-hover/80 text-text-muted')
                    }
                  >
                    {d.target ?? 'preview'}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <GitBranch size={10} className="shrink-0 text-text-muted" />
                      <span className="truncate font-mono text-text-primary">
                        {d.meta?.githubCommitRef ?? '—'}
                      </span>
                      {d.meta?.githubCommitSha && (
                        <span className="font-mono text-[11px] text-text-muted">
                          · {d.meta.githubCommitSha.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    {d.meta?.githubCommitMessage && (
                      <div className="truncate text-[12px] text-text-muted">
                        {d.meta.githubCommitMessage}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs tabular-nums text-text-muted">
                    {formatDuration(build)}
                  </div>
                  <div className="text-right text-xs tabular-nums text-text-muted">
                    {formatAge(d.createdAt)}
                  </div>
                  <div className="text-right">
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ' +
                        stateTone(d.state)
                      }
                    >
                      {d.state.toLowerCase()}
                    </span>
                  </div>
                  <div className="text-right">
                    <a
                      href={deploymentLogsUrl(d, vercel.teamId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-nativz-border/60 bg-background/40 px-2 py-0.5 text-[11px] text-accent-text transition-colors hover:border-accent/50"
                      aria-label="Open runtime logs in Vercel"
                    >
                      <ScrollText size={10} />
                      Logs
                    </a>
                  </div>
                </div>
              );
            })}
          </section>
        ) : null
      ) : (
        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-text">
              <Rocket size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-text-primary">
                Connect Vercel for live deployments + log stream
              </h3>
              <p className="mt-1 text-[12px] text-text-muted">
                Set <code className="rounded bg-background/60 px-1">VERCEL_TOKEN</code>,{' '}
                <code className="rounded bg-background/60 px-1">VERCEL_PROJECT_ID</code>, and{' '}
                <code className="rounded bg-background/60 px-1">VERCEL_ORG_ID</code> in your Vercel
                project env, then redeploy. Token needs <em>Read</em> scope on Projects +
                Deployments.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Live log stream — starts streaming on mount, no click required. */}
      {vercel.hasToken && streamTarget && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Live logs</h2>
              <p className="text-[12px] text-text-muted">
                Streaming from the {streamTarget.target ?? 'preview'} deploy{' '}
                <span className="font-mono text-accent-text/80">
                  {streamTarget.meta?.githubCommitSha?.slice(0, 8) ?? streamTarget.uid.slice(0, 12)}
                </span>
                . New events append automatically.
              </p>
            </div>
          </div>
          <LiveLogStream deploymentId={streamTarget.uid} />
        </section>
      )}
    </div>
  );
}
