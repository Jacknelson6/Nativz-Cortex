/**
 * Infrastructure › Compute — Vercel monitoring only.
 *
 * Strict scope: uptime, new deployments, and the log surface. Nothing else.
 * Cron schedule + cron run telemetry moved to the Overview tab's failure
 * feed and the tile-level trend sparkline so this page stays focused.
 *
 * Contents, top → bottom:
 *   • Top strip: environment · latest deploy · production status · uptime
 *   • Current deploy card (runtime env from Vercel)
 *   • URLs card (production + preview)
 *   • Deployments table with "Open logs" per row (Vercel API)
 */

import { unstable_cache } from 'next/cache';
import {
  ArrowUpRight,
  CircleDot,
  ExternalLink,
  GitBranch,
  Globe,
  Rocket,
  ScrollText,
  Timer,
} from 'lucide-react';
import { Stat } from '../stat';
import { Disclosure, SectionCard } from '../section-card';
import { INFRA_CACHE_TAG, INFRA_CACHE_TTL } from '../cache';

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
    const params = new URLSearchParams({ limit: '15' });
    if (projectId) params.set('projectId', projectId);
    if (teamId) params.set('teamId', teamId);
    const res = await fetch(`https://api.vercel.com/v6/deployments?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      return { hasToken: true, projectId, teamId, deployments: [], error: `Vercel API ${res.status}` };
    }
    const data = (await res.json()) as { deployments?: VercelDeployment[] };
    return { hasToken: true, projectId, teamId, deployments: data.deployments ?? [], error: null };
  } catch (err) {
    return {
      hasToken: true,
      projectId,
      teamId,
      deployments: [],
      error: err instanceof Error ? err.message : 'fetch failed',
    };
  }
}

const getComputeRollup = unstable_cache(
  async () => {
    const vercel = await fetchVercelDeployments();
    return { vercel };
  },
  ['infrastructure-compute-rollup'],
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

/**
 * Build the canonical Vercel log URL for a deployment. Uses inspectorUrl
 * when the API gives us one (authoritative), falling back to the known
 * team-slug + project pattern so the link still resolves locally.
 */
function deploymentLogsUrl(d: VercelDeployment, teamId: string | null): string {
  if (d.inspectorUrl) return `${d.inspectorUrl.replace(/\/$/, '')}/logs`;
  const slug = teamId === 'team_0vyaJsvD9Q8NOFTD8K1di8BB' ? 'anderson-collaborative' : teamId;
  return `https://vercel.com/${slug}/nativz-cortex/${d.uid}/logs`;
}

export async function ComputeTab() {
  const { vercel } = await getComputeRollup();

  // Runtime env — set automatically by Vercel on every deploy.
  const env = process.env.VERCEL_ENV ?? 'local';
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const ref = process.env.VERCEL_GIT_COMMIT_REF ?? null;
  const commitMessage = process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null;
  const commitAuthor = process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME ?? null;
  const region = process.env.VERCEL_REGION ?? 'local';
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  const branchUrl = process.env.VERCEL_BRANCH_URL
    ? `https://${process.env.VERCEL_BRANCH_URL}`
    : null;

  const productionUrl = 'https://cortex.nativz.io';
  const teamSlug =
    vercel.teamId === 'team_0vyaJsvD9Q8NOFTD8K1di8BB' ? 'anderson-collaborative' : vercel.teamId;
  const projectLogsUrl = teamSlug ? `https://vercel.com/${teamSlug}/nativz-cortex/logs` : null;
  const projectDeploysUrl = teamSlug
    ? `https://vercel.com/${teamSlug}/nativz-cortex/deployments`
    : 'https://vercel.com/dashboard';

  const latest = vercel.deployments[0] ?? null;
  const prod = vercel.deployments.find((d) => d.target === 'production') ?? null;

  // Uptime read: if the latest prod deploy is Ready, we're up. If it's Error
  // or the latest attempt failed, mark degraded so the stat reads as a
  // warning rather than silently showing the previous healthy state.
  const prodState = prod ? prod.state.toLowerCase() : 'unknown';
  const uptimeValue =
    prodState === 'ready' ? 'online' : prodState === 'error' || prodState === 'canceled' ? 'degraded' : prodState;

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Uptime"
          value={uptimeValue}
          sub={prod ? `${prod.target} · ${formatAge(prod.createdAt)}` : productionUrl.replace('https://', '')}
        />
        <Stat
          label="Environment"
          value={env.toUpperCase()}
          sub={region !== 'local' ? `region · ${region}` : 'running locally'}
        />
        <Stat
          label="Latest deploy"
          value={latest ? formatAge(latest.createdAt) : sha ? 'current' : '—'}
          sub={latest?.state.toLowerCase() ?? (sha ? 'runtime env' : 'no telemetry')}
        />
        <Stat
          label="Deployments (recent)"
          value={`${vercel.deployments.length}`}
          sub={vercel.hasToken ? 'Vercel API connected' : 'Connect Vercel for live data'}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SectionCard
          icon={<Rocket size={18} />}
          title="Current deploy"
          sub="Runtime env · always set by Vercel on deploy"
          eyebrow="Live"
          tone="brand"
          action={
            projectLogsUrl ? (
              <a
                href={projectLogsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-nativz-border/60 bg-background/40 px-2.5 py-1 text-[12px] text-accent-text transition-colors hover:border-accent/50"
              >
                Runtime logs <ArrowUpRight size={10} />
              </a>
            ) : undefined
          }
        >
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <DeployMeta icon={<GitBranch size={11} />} label="Branch" value={ref ?? 'local'} mono />
            <DeployMeta
              icon={<CircleDot size={11} />}
              label="Commit"
              value={sha ? sha.slice(0, 8) : 'local'}
              mono
            />
            <DeployMeta icon={<Timer size={11} />} label="Region" value={region} mono />
            <DeployMeta
              icon={<Globe size={11} />}
              label="URL"
              value={vercelUrl ?? productionUrl}
              mono
              truncate
            />
          </dl>
          {commitMessage && (
            <div className="mt-4 rounded-lg border border-nativz-border/60 bg-background/40 px-3 py-2">
              <div className="text-[12px] uppercase tracking-wide text-text-muted">
                Commit message
              </div>
              <div className="mt-0.5 line-clamp-2 text-xs text-text-primary">{commitMessage}</div>
              {commitAuthor && (
                <div className="mt-1 text-[12px] text-text-muted">by {commitAuthor}</div>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard
          icon={<ExternalLink size={18} />}
          title="URLs"
          sub="Production + preview targets"
          tone="action"
        >
          <div className="space-y-2">
            <UrlRow label="Production" url={productionUrl} tone="ok" />
            {branchUrl && branchUrl !== productionUrl && (
              <UrlRow label={`Branch (${ref ?? 'preview'})`} url={branchUrl} tone="preview" />
            )}
            {vercelUrl && vercelUrl !== productionUrl && vercelUrl !== branchUrl && (
              <UrlRow label="Deployment" url={vercelUrl} tone="preview" />
            )}
          </div>
          <p className="mt-4 text-[12px] text-text-muted">
            Every push to main promotes to production. Branch previews live at{' '}
            <code className="rounded bg-background/60 px-1">*.vercel.app</code> URLs.
          </p>
        </SectionCard>
      </section>

      {vercel.hasToken ? (
        vercel.error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
            Vercel API failed: {vercel.error}.{' '}
            <span className="text-text-muted">
              Token may lack read scope, or{' '}
              <code className="rounded bg-background/60 px-1">VERCEL_PROJECT_ID</code> is missing.
            </span>
          </div>
        ) : vercel.deployments.length > 0 ? (
          <Disclosure
            summary="Recent deployments · Vercel API"
            count={vercel.deployments.length}
            defaultOpen
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[12px] text-text-muted">
                Click a row&apos;s <span className="text-accent-text">Logs</span> link to open
                the deploy&apos;s runtime log stream in Vercel.
              </p>
              <a
                href={projectDeploysUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-nativz-border/60 bg-background/40 px-2.5 py-1 text-[12px] text-accent-text transition-colors hover:border-accent/50"
              >
                Open in Vercel <ArrowUpRight size={10} />
              </a>
            </div>
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 border-b border-nativz-border/40 pb-2 text-[12px] font-mono uppercase tracking-[0.18em] text-text-muted">
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
                  className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 border-b border-nativz-border/40 py-2 text-sm last:border-b-0"
                >
                  <span
                    className={
                      'rounded px-1.5 py-0.5 text-[12px] font-medium uppercase tracking-wide ' +
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
                        <span className="font-mono text-[12px] text-text-muted">
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
                        'rounded-full px-2 py-0.5 text-[12px] font-medium uppercase tracking-wide ' +
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
                      className="inline-flex items-center gap-1 rounded-full border border-nativz-border/60 bg-background/40 px-2 py-0.5 text-[12px] text-accent-text transition-colors hover:border-accent/50"
                      aria-label="Open runtime logs in Vercel"
                    >
                      <ScrollText size={10} />
                      Logs
                    </a>
                  </div>
                </div>
              );
            })}
          </Disclosure>
        ) : null
      ) : (
        <SectionCard
          icon={<Rocket size={18} />}
          title="Connect Vercel for live deployments"
          sub="Adding VERCEL_TOKEN unlocks the deployments table + per-deploy log links."
          tone="action"
        >
          <p className="text-[12px] text-text-muted">
            Add these to <code className="rounded bg-background/60 px-1">.env.local</code> and your
            Vercel project env, then redeploy. Token needs <em>Read</em> scope on Projects +
            Deployments.
          </p>
          <ul className="mt-3 space-y-1 text-[12px] font-mono text-text-muted">
            <li>· VERCEL_TOKEN=…</li>
            <li>· VERCEL_PROJECT_ID=…</li>
            <li>· VERCEL_ORG_ID=team_…</li>
          </ul>
          <a
            href="https://vercel.com/account/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[12px] text-accent-text underline decoration-dotted"
          >
            Mint a token <ArrowUpRight size={10} />
          </a>
        </SectionCard>
      )}
    </div>
  );
}

function DeployMeta({
  icon,
  label,
  value,
  mono,
  truncate,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[12px] uppercase tracking-wide text-text-muted">
        {icon}
        {label}
      </div>
      <div
        className={
          `mt-0.5 text-xs text-text-primary ${mono ? 'font-mono' : ''} ${
            truncate ? 'truncate' : ''
          }`
        }
        title={truncate ? value : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function UrlRow({ label, url, tone }: { label: string; url: string; tone: 'ok' | 'preview' }) {
  const toneClass =
    tone === 'ok'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : 'border-nativz-border bg-surface-hover/60 text-text-secondary';
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center justify-between gap-3 rounded-lg border border-nativz-border bg-background/40 px-3 py-2 transition-colors hover:border-accent/40"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[12px] uppercase tracking-wide text-text-muted">{label}</div>
        <div className="mt-0.5 truncate font-mono text-xs text-text-primary">{url}</div>
      </div>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-[12px] font-medium uppercase tracking-wide ${toneClass}`}
      >
        {tone === 'ok' ? 'live' : 'preview'}
      </span>
      <ArrowUpRight size={12} className="text-text-muted transition-transform group-hover:translate-x-0.5" />
    </a>
  );
}
