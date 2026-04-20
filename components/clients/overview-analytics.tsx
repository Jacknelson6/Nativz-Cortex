'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Loader2,
  Share2,
  DollarSign,
  Gauge,
  Megaphone,
  TrendingUp,
  TrendingDown,
  Zap,
  Lightbulb,
  CalendarClock,
  AlertCircle,
  Send,
  CheckCircle2,
  Search as SearchIcon,
  RefreshCw,
  Circle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatRelativeTime } from '@/lib/utils/format';

type SocialSummary = {
  connectedPlatforms: number;
  platforms: { platform: string; username: string }[];
  postsLast30Days: number;
};

type BenchmarkingSummary = {
  activeBenchmarks: number;
  competitorsTracked: number;
  followersLatest: number | null;
  followersDelta30d: number | null;
};

type AffiliateSummary =
  | { hasIntegration: false }
  | { hasIntegration: true; revenue: number; referrals: number; activeAffiliates: number; commission: number; error?: boolean };

type PipelineSummary = {
  ideasWaiting: number;
  scheduledNext14d: number;
  daysSinceLastPost: number | null;
  lastPostIso: string | null;
};

type ActivityItem = {
  id: string;
  kind: 'idea_submitted' | 'post_published' | 'post_scheduled' | 'search_completed' | 'search_started';
  at: string;
  label: string;
};

type SummaryResponse = {
  generatedAt: string;
  social: SocialSummary;
  affiliate: AffiliateSummary;
  benchmarking: BenchmarkingSummary;
  paidMedia: null;
  pipeline: PipelineSummary;
  activity: ActivityItem[];
};

// ═══════════════════════════════════════════════════════════════════════════
// Container — fetches once, fans out to the three sections
// ═══════════════════════════════════════════════════════════════════════════

export function OverviewAnalytics({ clientId, slug }: { clientId: string; slug: string }) {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const analyticsBase = `/admin/analytics?clientId=${encodeURIComponent(clientId)}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/analytics/summary`, { cache: 'no-store' });
      if (!res.ok) return;
      const payload = (await res.json()) as SummaryResponse;
      setData(payload);
    } catch {
      // silent
    }
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <div className="space-y-6">
      <AtAGlanceSection
        data={data}
        loading={loading}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        analyticsBase={analyticsBase}
      />
      <PipelineStrip data={data?.pipeline} loading={loading} slug={slug} />
      <ActivityFeed data={data?.activity ?? null} loading={loading} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// At a glance — 4 analytics tiles
// ═══════════════════════════════════════════════════════════════════════════

function AtAGlanceSection({
  data,
  loading,
  refreshing,
  onRefresh,
  analyticsBase,
}: {
  data: SummaryResponse | null;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  analyticsBase: string;
}) {
  return (
    <div>
      <div className="flex items-end justify-between mb-3 gap-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">At a glance</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Last 30 days. Click any tile for the full breakdown.
            {data?.generatedAt && (
              <span className="ml-1 text-text-muted/70">
                · updated {formatRelativeTime(data.generatedAt)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh"
          >
            <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link
            href={analyticsBase}
            className="inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline"
          >
            Open analytics
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SocialTile loading={loading} data={data?.social} href={`${analyticsBase}&tab=social`} />
        <AffiliateTile loading={loading} data={data?.affiliate} href={`${analyticsBase}&tab=affiliates`} />
        <BenchmarkingTile loading={loading} data={data?.benchmarking} href={`${analyticsBase}&tab=benchmarking`} />
        <PaidMediaTile href={`${analyticsBase}&tab=social`} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Pipeline strip — content pipeline status
// ═══════════════════════════════════════════════════════════════════════════

function PipelineStrip({
  data,
  loading,
  slug,
}: {
  data: PipelineSummary | undefined;
  loading: boolean;
  slug: string;
}) {
  return (
    <div>
      <div className="flex items-end justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Content pipeline</h2>
          <p className="text-xs text-text-muted mt-0.5">Where this client stands right now.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PipelineCard
          icon={<Lightbulb size={14} />}
          label="Ideas waiting"
          value={loading || !data ? null : data.ideasWaiting}
          hint={data && data.ideasWaiting > 0 ? 'Review & approve' : 'Inbox clear'}
          tone={data && data.ideasWaiting > 0 ? 'attention' : 'default'}
          href={`/admin/clients/${slug}/knowledge`}
        />
        <PipelineCard
          icon={<CalendarClock size={14} />}
          label="Scheduled · next 14d"
          value={loading || !data ? null : data.scheduledNext14d}
          hint={data && data.scheduledNext14d === 0 ? 'Nothing queued' : 'On deck'}
          tone={data && data.scheduledNext14d === 0 ? 'attention' : 'good'}
          href="/admin/scheduler"
        />
        <PipelineCard
          icon={<Send size={14} />}
          label="Days since last post"
          value={loading || !data ? null : data.daysSinceLastPost ?? '—'}
          hint={
            data && data.daysSinceLastPost != null
              ? data.daysSinceLastPost <= 3
                ? 'Active'
                : data.daysSinceLastPost <= 7
                  ? 'Slowing'
                  : 'Stalled'
              : 'Never posted'
          }
          tone={
            data && data.daysSinceLastPost != null
              ? data.daysSinceLastPost <= 3
                ? 'good'
                : data.daysSinceLastPost <= 7
                  ? 'warn'
                  : 'attention'
              : 'default'
          }
          href="/admin/scheduler"
        />
      </div>
    </div>
  );
}

function PipelineCard({
  icon,
  label,
  value,
  hint,
  tone,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string | null;
  hint: string;
  tone: 'default' | 'good' | 'warn' | 'attention';
  href?: string;
}) {
  const toneRing =
    tone === 'good'
      ? 'ring-emerald-500/20'
      : tone === 'warn'
        ? 'ring-amber-500/20'
        : tone === 'attention'
          ? 'ring-red-500/20'
          : 'ring-transparent';
  const toneDot =
    tone === 'good'
      ? 'text-emerald-400'
      : tone === 'warn'
        ? 'text-amber-400'
        : tone === 'attention'
          ? 'text-red-400'
          : 'text-text-muted';

  const body = (
    <Card className={`h-full ring-1 ${toneRing} ${href ? 'hover:border-accent/40 transition-colors' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-hover text-text-muted">
          {icon}
        </div>
        <p className="text-xs font-medium text-text-muted">{label}</p>
      </div>
      <div className="flex items-baseline gap-2">
        {value === null ? (
          <div className="h-7 w-12 bg-surface-hover rounded animate-pulse" />
        ) : (
          <p className="text-2xl font-semibold text-text-primary">{value}</p>
        )}
        <div className={`flex items-center gap-1 text-xs ${toneDot}`}>
          <Circle size={6} className="fill-current" />
          {hint}
        </div>
      </div>
    </Card>
  );

  if (href) return <Link href={href}>{body}</Link>;
  return body;
}

// ═══════════════════════════════════════════════════════════════════════════
// Activity feed — last 5 events
// ═══════════════════════════════════════════════════════════════════════════

function ActivityFeed({
  data,
  loading,
}: {
  data: ActivityItem[] | null;
  loading: boolean;
}) {
  return (
    <div>
      <div className="flex items-end justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Recent activity</h2>
          <p className="text-xs text-text-muted mt-0.5">Last 5 events.</p>
        </div>
      </div>

      <Card>
        {loading || data === null ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-7 w-7 rounded-full bg-surface-hover animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-3/5 bg-surface-hover rounded animate-pulse" />
                  <div className="h-2.5 w-20 bg-surface-hover rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-text-muted py-2">
            No recent activity yet. Events from ideas, posts, and searches will appear here.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const { icon, ringClass, verb } = activityVisual(item.kind);
  return (
    <li className="flex items-start gap-3">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ${ringClass}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-primary">
          <span className="text-text-muted">{verb}</span>{' '}
          <span className="text-text-primary">{item.label}</span>
        </p>
        <p className="text-[11px] text-text-muted mt-0.5">{formatRelativeTime(item.at)}</p>
      </div>
    </li>
  );
}

function activityVisual(kind: ActivityItem['kind']): {
  icon: React.ReactNode;
  ringClass: string;
  verb: string;
} {
  switch (kind) {
    case 'idea_submitted':
      return { icon: <Lightbulb size={13} className="text-amber-400" />, ringClass: 'bg-amber-500/10 ring-amber-500/20', verb: 'Idea submitted —' };
    case 'post_published':
      return { icon: <CheckCircle2 size={13} className="text-emerald-400" />, ringClass: 'bg-emerald-500/10 ring-emerald-500/20', verb: 'Post published —' };
    case 'post_scheduled':
      return { icon: <CalendarClock size={13} className="text-sky-400" />, ringClass: 'bg-sky-500/10 ring-sky-500/20', verb: 'Post scheduled —' };
    case 'search_completed':
      return { icon: <SearchIcon size={13} className="text-violet-400" />, ringClass: 'bg-violet-500/10 ring-violet-500/20', verb: 'Topic search —' };
    case 'search_started':
      return { icon: <SearchIcon size={13} className="text-text-muted" />, ringClass: 'bg-surface-hover ring-nativz-border', verb: 'Search started —' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Analytics tiles (unchanged logic; layout tightened)
// ═══════════════════════════════════════════════════════════════════════════

function TileShell({
  title,
  icon,
  tone = 'default',
  href,
  children,
  disabled,
}: {
  title: string;
  icon: React.ReactNode;
  tone?: 'default' | 'muted';
  href: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const body = (
    <Card
      className={`h-full transition-colors ${
        disabled ? 'opacity-60 cursor-default' : 'hover:border-accent/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-lg ${
              tone === 'muted' ? 'bg-surface-hover text-text-muted' : 'bg-accent/10 text-accent-text'
            }`}
          >
            {icon}
          </div>
          <p className="text-sm font-semibold text-text-primary">{title}</p>
        </div>
        {!disabled && <ArrowRight size={12} className="text-text-muted mt-1.5 shrink-0" />}
      </div>
      {children}
    </Card>
  );
  if (disabled) return body;
  return <Link href={href}>{body}</Link>;
}

function SocialTile({ loading, data, href }: { loading: boolean; data?: SocialSummary; href: string }) {
  if (loading || !data) {
    return <TileShell title="Socials" icon={<Share2 size={14} />} href={href}><SkeletonKpis /></TileShell>;
  }
  if (data.connectedPlatforms === 0) {
    return (
      <TileShell title="Socials" icon={<Share2 size={14} />} href={href}>
        <EmptyTile message="No connected accounts" cta="Connect in Settings → Integrations" />
      </TileShell>
    );
  }
  return (
    <TileShell title="Socials" icon={<Share2 size={14} />} href={href}>
      <div className="space-y-1">
        <Kpi value={data.connectedPlatforms} label="connected" />
        <Kpi value={data.postsLast30Days} label="posts · 30d" muted />
      </div>
      {data.platforms.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {data.platforms.slice(0, 4).map((p) => (
            <span
              key={`${p.platform}-${p.username}`}
              className="text-[10px] font-medium text-text-muted bg-surface-hover/50 rounded-full px-2 py-0.5"
            >
              @{p.username}
            </span>
          ))}
          {data.platforms.length > 4 && <span className="text-[10px] text-text-muted">+{data.platforms.length - 4}</span>}
        </div>
      )}
    </TileShell>
  );
}

function PaidMediaTile({ href }: { href: string }) {
  return (
    <TileShell title="Paid media" icon={<Megaphone size={14} />} tone="muted" href={href} disabled>
      <EmptyTile message="Not connected" cta="Meta Ads + Google Ads coming soon" />
    </TileShell>
  );
}

function AffiliateTile({ loading, data, href }: { loading: boolean; data?: AffiliateSummary; href: string }) {
  if (loading || !data) {
    return <TileShell title="Affiliate" icon={<DollarSign size={14} />} href={href}><SkeletonKpis /></TileShell>;
  }
  if (!data.hasIntegration) {
    return (
      <TileShell title="Affiliate" icon={<DollarSign size={14} />} href={href}>
        <EmptyTile message="UpPromote not connected" cta="Connect in Settings → Integrations" />
      </TileShell>
    );
  }
  if (data.error) {
    return (
      <TileShell title="Affiliate" icon={<DollarSign size={14} />} href={href}>
        <div className="flex items-start gap-2 text-xs text-text-muted">
          <AlertCircle size={12} className="mt-0.5 text-red-400 shrink-0" />
          <p>UpPromote sync failed. Check integration status.</p>
        </div>
      </TileShell>
    );
  }
  return (
    <TileShell title="Affiliate" icon={<DollarSign size={14} />} href={href}>
      <div className="space-y-1">
        <Kpi value={currencyShort(data.revenue)} label="revenue · 30d" />
        <Kpi value={formatInt(data.referrals)} label="referrals" muted />
        <Kpi value={formatInt(data.activeAffiliates)} label="active affiliates" muted />
      </div>
    </TileShell>
  );
}

function BenchmarkingTile({ loading, data, href }: { loading: boolean; data?: BenchmarkingSummary; href: string }) {
  if (loading || !data) {
    return <TileShell title="Benchmarking" icon={<Gauge size={14} />} href={href}><SkeletonKpis /></TileShell>;
  }
  if (data.activeBenchmarks === 0) {
    return (
      <TileShell title="Benchmarking" icon={<Gauge size={14} />} href={href}>
        <EmptyTile message="No active benchmarks" cta="Run an audit to start tracking" />
      </TileShell>
    );
  }
  return (
    <TileShell title="Benchmarking" icon={<Gauge size={14} />} href={href}>
      <div className="space-y-1">
        {data.followersLatest != null && <Kpi value={formatInt(data.followersLatest)} label="followers tracked" />}
        {data.followersDelta30d != null && <DeltaKpi value={data.followersDelta30d} label="30d" />}
        <Kpi
          value={data.competitorsTracked}
          label={`competitor${data.competitorsTracked === 1 ? '' : 's'}`}
          muted
        />
      </div>
    </TileShell>
  );
}

// ── primitives ───────────────────────────────────────────────────────────────

function Kpi({ value, label, muted }: { value: number | string; label: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className={
          muted ? 'text-sm font-medium text-text-secondary' : 'text-xl font-semibold text-text-primary'
        }
      >
        {value}
      </span>
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  );
}

function DeltaKpi({ value, label }: { value: number; label: string }) {
  const positive = value >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  const color = positive ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className={`flex items-center gap-1 text-xs ${color}`}>
      <Icon size={12} />
      <span className="font-semibold">
        {positive ? '+' : ''}
        {formatInt(value)}
      </span>
      <span className="text-text-muted">{label}</span>
    </div>
  );
}

function SkeletonKpis() {
  return (
    <div className="space-y-2">
      <div className="h-5 w-20 bg-surface-hover rounded animate-pulse" />
      <div className="h-3 w-32 bg-surface-hover rounded animate-pulse" />
      <div className="flex items-center gap-1 text-xs text-text-muted">
        <Loader2 size={10} className="animate-spin" />
        loading…
      </div>
    </div>
  );
}

function EmptyTile({ message, cta }: { message: string; cta: string }) {
  return (
    <div className="flex items-start gap-2">
      <Zap size={12} className="mt-0.5 text-text-muted shrink-0" />
      <div>
        <p className="text-xs font-medium text-text-secondary">{message}</p>
        <p className="text-[11px] text-text-muted mt-0.5">{cta}</p>
      </div>
    </div>
  );
}

function formatInt(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

function currencyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}
