'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle,
  Users,
  Eye,
  TrendingUp,
  BarChart3,
  ExternalLink,
  Globe,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { ScrollProgress } from '@/components/ui/scroll-progress';
import { VideoGrid } from '@/components/research/video-grid';
import { useAgencyBrand } from '@/lib/agency/use-agency-brand';
import type {
  PlatformReport,
  CompetitorProfile,
  AuditScorecard,
  ScorecardItem,
  ScoreStatus,
  WebsiteContext,
} from '@/lib/audit/types';
import type { TopicSearchVideoRow } from '@/lib/scrapers/types';

// ── Constants ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ScoreStatus, { dot: string; bg: string; text: string; label: string }> = {
  good: { dot: 'bg-emerald-400', bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Good' },
  warning: { dot: 'bg-amber-400', bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Needs work' },
  poor: { dot: 'bg-red-400', bg: 'bg-red-500/10', text: 'text-red-400', label: 'Not good' },
};

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: '#FF0050',
  instagram: '#C13584',
  facebook: '#1877F2',
  youtube: '#FF0000',
};

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ── Types ───────────────────────────────────────────────────────────────

interface AuditRecord {
  id: string;
  website_url: string | null;
  tiktok_url: string;
  status: string;
  prospect_data: {
    websiteContext?: WebsiteContext | null;
    platforms?: PlatformReport[];
    detectedSocialLinks?: { platform: string; url: string; username: string }[];
  } | null;
  competitors_data: CompetitorProfile[] | null;
  scorecard: AuditScorecard | null;
  videos_data: TopicSearchVideoRow[] | null;
  error_message: string | null;
  created_at: string;
}

// ── Main Component ──────────────────────────────────────────────────────

export function SharedAuditClient({ audit }: { audit: AuditRecord }) {
  const { brandName } = useAgencyBrand();
  const [activePlatformTab, setActivePlatformTab] = useState<string | null>(null);

  const platforms = useMemo(() => audit.prospect_data?.platforms ?? [], [audit.prospect_data]);
  const websiteContext = audit.prospect_data?.websiteContext ?? null;
  const competitors = audit.competitors_data ?? [];
  const scorecard = audit.scorecard;
  const videos = (audit.videos_data ?? []) as TopicSearchVideoRow[];
  const activePlatform = platforms.find(p => p.platform === activePlatformTab) ?? platforms[0];

  // Set first platform tab when data loads
  useEffect(() => {
    if (platforms.length > 0 && !activePlatformTab) {
      setActivePlatformTab(platforms[0].platform);
    }
  }, [platforms, activePlatformTab]);

  return (
    <div className="min-h-screen bg-background">
      <ScrollProgress />

      {/* Header */}
      <div className="border-b border-nativz-border bg-surface/80 backdrop-blur-sm">
        <div className="flex w-full flex-col gap-3 px-6 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-surface">
              <Globe size={14} className="text-accent-text" />
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-semibold text-text-primary truncate">
                {websiteContext?.title
                  ? websiteContext.title
                  : audit.website_url
                    ? audit.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')
                    : 'Social media analysis'}
              </span>
              {platforms.length > 0 && (
                <>
                  <span className="shrink-0 text-text-muted">&middot;</span>
                  <span className="text-text-muted">
                    {platforms.length} platform{platforms.length !== 1 ? 's' : ''}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
            {scorecard && (
              <div className="flex items-center gap-1.5">
                <span className={`text-lg font-bold ${scorecard.overallScore >= 70 ? 'text-emerald-400' : scorecard.overallScore >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                  {scorecard.overallScore}
                </span>
                <span className="text-xs text-text-muted">/100</span>
              </div>
            )}
            <span className="hidden sm:flex items-center text-xs text-text-muted">
              {new Date(audit.created_at).toLocaleDateString()}
            </span>
            <Badge variant="info">Shared report</Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="w-full max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Website context */}
        {websiteContext && (
          <div className="rounded-xl border border-nativz-border bg-surface p-5">
            <div className="flex items-center gap-2 mb-2">
              <Globe size={16} className="text-text-muted" />
              <h3 className="text-sm font-semibold text-text-primary">Brand overview</h3>
            </div>
            <p className="text-sm text-text-secondary">{websiteContext.description}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="text-xs bg-accent-surface/20 text-accent-text px-2.5 py-1 rounded-full">
                {websiteContext.industry}
              </span>
              {websiteContext.keywords.slice(0, 5).map(kw => (
                <span key={kw} className="text-xs bg-surface-hover text-text-muted px-2.5 py-1 rounded-full">
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Scorecard */}
        {scorecard && scorecard.items.length > 0 && (
          <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
            <div className="px-5 py-4 border-b border-nativz-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Analysis scorecard</h3>
                <div className="flex items-center gap-4 mt-1">
                  {(['good', 'warning', 'poor'] as ScoreStatus[]).map(s => (
                    <span key={s} className="flex items-center gap-1.5 text-xs text-text-muted">
                      <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[s].dot}`} />
                      {STATUS_COLORS[s].label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-nativz-border">
              {scorecard.items.map((item, i) => (
                <ScorecardCard key={i} item={item} />
              ))}
            </div>
          </div>
        )}

        {/* Executive summary */}
        {scorecard?.summary && (
          <div className="rounded-xl border border-nativz-border bg-surface p-5">
            <h3 className="text-sm font-semibold text-text-primary mb-2">Executive summary</h3>
            <p className="text-sm text-text-secondary leading-relaxed">{scorecard.summary}</p>
          </div>
        )}

        {/* Platform tabs + data */}
        {platforms.length > 0 && (
          <div className="space-y-4">
            {platforms.length > 1 && (
              <div className="flex items-center rounded-lg border border-nativz-border bg-surface p-0.5">
                {platforms.map(p => (
                  <button
                    key={p.platform}
                    onClick={() => setActivePlatformTab(p.platform)}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      activePlatformTab === p.platform
                        ? 'bg-accent-surface text-accent-text shadow-sm'
                        : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[p.platform] ?? 'var(--accent)' }} />
                    {PLATFORM_LABELS[p.platform] ?? p.platform}
                  </button>
                ))}
              </div>
            )}

            {activePlatform && <PlatformDetail platform={activePlatform} />}
          </div>
        )}

        {/* Competitors */}
        {competitors.length > 0 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-nativz-border bg-surface p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Competitors</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {competitors.map(comp => (
                  <div key={comp.username} className="rounded-lg border border-nativz-border bg-background p-4">
                    <div className="flex items-center gap-3 mb-3">
                      {comp.avatarUrl && (
                        <img src={comp.avatarUrl} alt={comp.displayName} className="h-10 w-10 rounded-full object-cover" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-text-primary">{comp.displayName}</p>
                        <a
                          href={comp.profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-accent-text hover:underline flex items-center gap-1"
                        >
                          @{comp.username} <ExternalLink size={10} />
                        </a>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-text-muted">Followers</span>
                        <p className="font-medium text-text-primary">{formatNumber(comp.followers)}</p>
                      </div>
                      <div>
                        <span className="text-text-muted">Engagement</span>
                        <p className="font-medium text-text-primary">{(comp.engagementRate * 100).toFixed(2)}%</p>
                      </div>
                      <div>
                        <span className="text-text-muted">Avg views</span>
                        <p className="font-medium text-text-primary">{formatNumber(comp.avgViews)}</p>
                      </div>
                      <div>
                        <span className="text-text-muted">Frequency</span>
                        <p className="font-medium text-text-primary">{comp.postingFrequency}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Competitor comparison charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Avg views comparison */}
              <div className="rounded-xl border border-nativz-border bg-surface p-5">
                <h4 className="text-sm font-semibold text-text-primary mb-4">Average views per post</h4>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        ...(activePlatform ? [{ name: `@${activePlatform.profile.username} (You)`, views: activePlatform.avgViews, fill: 'var(--accent)' }] : []),
                        ...competitors.map((c, i) => ({
                          name: `@${c.username}`,
                          views: c.avgViews,
                          fill: ['#A78BFA', '#34D399', '#F97316', '#EC4899', '#14B8A6'][i % 5],
                        })),
                      ]}
                      layout="vertical"
                      margin={{ left: 10, right: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--nativz-border)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => formatNumber(v)} />
                      <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={120} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--nativz-border)', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(value: number | undefined) => [formatNumber(value ?? 0), 'Avg views']}
                      />
                      <Bar dataKey="views" radius={[0, 4, 4, 0]} barSize={24}>
                        {[
                          ...(activePlatform ? [{ fill: 'var(--accent)' }] : []),
                          ...competitors.map((_, i) => ({ fill: ['#A78BFA', '#34D399', '#F97316', '#EC4899', '#14B8A6'][i % 5] })),
                        ].map((entry, idx) => (
                          <rect key={idx} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Engagement rate comparison */}
              <div className="rounded-xl border border-nativz-border bg-surface p-5">
                <h4 className="text-sm font-semibold text-text-primary mb-4">Engagement rate comparison</h4>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        ...(activePlatform ? [{ name: `@${activePlatform.profile.username} (You)`, er: parseFloat((activePlatform.engagementRate * 100).toFixed(2)) }] : []),
                        ...competitors.map(c => ({ name: `@${c.username}`, er: parseFloat((c.engagementRate * 100).toFixed(2)) })),
                      ]}
                      layout="vertical"
                      margin={{ left: 10, right: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--nativz-border)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                      <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={120} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--nativz-border)', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(value: number | undefined) => [`${value ?? 0}%`, 'ER']}
                      />
                      <Bar dataKey="er" fill="var(--accent2)" radius={[0, 4, 4, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Source browser (VideoGrid) */}
        {videos.length > 0 && (
          <div className="rounded-xl border border-nativz-border bg-surface p-5">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Source content</h3>
            <VideoGrid videos={videos} searchId={audit.id} defaultClientId={null} enableInlineVideoAnalysis={false} />
          </div>
        )}
      </div>

      <ScrollToTop />

      {/* Footer */}
      <div className="border-t border-nativz-border py-6 text-center">
        <p className="text-xs text-text-muted">
          Powered by <span className="font-medium text-text-secondary">{brandName} Cortex</span>
        </p>
      </div>
    </div>
  );
}

// ── Platform detail with Recharts ───────────────────────────────────────

function PlatformDetail({ platform }: { platform: PlatformReport }) {
  const engagementData = useMemo(() => {
    return platform.videos
      .filter(v => v.publishDate)
      .sort((a, b) => new Date(a.publishDate!).getTime() - new Date(b.publishDate!).getTime())
      .map(v => {
        const er = platform.profile.followers > 0
          ? ((v.likes + v.comments + v.shares) / platform.profile.followers) * 100
          : 0;
        return {
          date: new Date(v.publishDate!).toLocaleDateString([], { month: 'short', day: 'numeric' }),
          views: v.views,
          likes: v.likes,
          comments: v.comments,
          er: parseFloat(er.toFixed(2)),
          description: v.description.substring(0, 50),
        };
      });
  }, [platform]);

  const topPosts = useMemo(() => {
    return [...platform.videos].sort((a, b) => b.views - a.views).slice(0, 5);
  }, [platform]);

  const color = PLATFORM_COLORS[platform.platform] ?? 'var(--accent)';

  return (
    <div className="space-y-4">
      {/* Profile card */}
      <div className="rounded-xl border border-nativz-border bg-surface p-5">
        <div className="flex items-start gap-4">
          {platform.profile.avatarUrl && (
            <img src={platform.profile.avatarUrl} alt={platform.profile.displayName} className="h-14 w-14 rounded-full object-cover" />
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-text-primary">{platform.profile.displayName}</h2>
              <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ backgroundColor: `${color}20`, color }}>
                {platform.platform}
              </span>
              {platform.profile.verified && <CheckCircle size={16} className="text-accent-text" />}
            </div>
            <a
              href={platform.profile.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent-text hover:underline flex items-center gap-1"
            >
              @{platform.profile.username} <ExternalLink size={12} />
            </a>
            {platform.profile.bio && (
              <p className="mt-2 text-sm text-text-secondary line-clamp-2">{platform.profile.bio}</p>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Followers" value={formatNumber(platform.profile.followers)} />
          <StatCard icon={Eye} label="Avg views" value={formatNumber(platform.avgViews)} />
          <StatCard icon={TrendingUp} label="Engagement" value={`${(platform.engagementRate * 100).toFixed(2)}%`} />
          <StatCard icon={BarChart3} label="Frequency" value={platform.postingFrequency} />
        </div>
      </div>

      {/* Engagement rate over time chart */}
      {engagementData.length > 2 && (
        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <h4 className="text-sm font-semibold text-text-primary mb-4">Engagement rate over time</h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={engagementData}>
                <defs>
                  <linearGradient id={`erGrad-shared-${platform.platform}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--nativz-border)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--nativz-border)', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(value: number | undefined) => [`${value ?? 0}%`, 'ER']}
                />
                <Area type="monotone" dataKey="er" stroke={color} fillOpacity={1} fill={`url(#erGrad-shared-${platform.platform})`} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Views per post bar chart */}
      {engagementData.length > 2 && (
        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <h4 className="text-sm font-semibold text-text-primary mb-4">Views per post</h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={engagementData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--nativz-border)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => formatNumber(v)} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--nativz-border)', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(value: number | undefined) => [formatNumber(value ?? 0), 'Views']}
                />
                <Bar dataKey="views" fill={color} radius={[4, 4, 0, 0]} opacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top performing posts */}
      {topPosts.length > 0 && (
        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <h4 className="text-sm font-semibold text-text-primary mb-4">Top performing posts</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {topPosts.map((post, i) => (
              <a
                key={post.id || i}
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-lg border border-nativz-border bg-background overflow-hidden hover:border-accent/40 transition-colors"
              >
                {post.thumbnailUrl ? (
                  <div className={`bg-surface-hover overflow-hidden ${
                    post.platform === 'tiktok' || post.platform === 'instagram' || (post.platform === 'youtube' && post.duration != null && post.duration <= 60)
                      ? 'aspect-[9/16]' : 'aspect-video'
                  }`}>
                    <img src={post.thumbnailUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                ) : (
                  <div className={`bg-surface-hover flex items-center justify-center ${
                    post.platform === 'tiktok' || post.platform === 'instagram' ? 'aspect-[9/16]' : 'aspect-video'
                  }`}>
                    <Eye size={20} className="text-text-muted/30" />
                  </div>
                )}
                <div className="p-2">
                  <p className="text-[10px] text-text-muted">{formatNumber(post.views)} views</p>
                  <p className="text-[10px] text-text-muted">{formatNumber(post.likes)} likes &middot; {formatNumber(post.comments)} comments</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function ScorecardCard({ item }: { item: ScorecardItem }) {
  const style = STATUS_COLORS[item.prospectStatus];
  return (
    <div className="bg-surface p-4">
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className={`h-3 w-3 rounded-full shrink-0 ${style.dot}`} />
        <h4 className="text-sm font-medium text-text-primary">{item.label}</h4>
      </div>
      <p className="text-xs text-text-secondary ml-5.5 pl-0.5">{item.prospectValue}</p>
      {item.competitors.length > 0 && (
        <div className="mt-2 ml-5.5 pl-0.5 flex flex-wrap gap-1.5">
          {item.competitors.map(comp => {
            const compStyle = STATUS_COLORS[comp.status];
            return (
              <span
                key={comp.username}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${compStyle.bg} ${compStyle.text}`}
                title={comp.value}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${compStyle.dot}`} />
                @{comp.username}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-nativz-border bg-background px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-text-muted mb-1">
        <Icon size={12} />
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-sm font-semibold text-text-primary">{value}</p>
    </div>
  );
}
