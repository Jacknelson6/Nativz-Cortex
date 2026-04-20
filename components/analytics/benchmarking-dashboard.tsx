'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  RefreshCw,
  Trash2,
  Users,
  Eye,
  TrendingUp,
  Sparkles,
  ExternalLink,
  Loader2,
  X,
  BarChart3,
  Globe,
  Check,
} from 'lucide-react';
import { PlatformBadge } from '@/components/reporting/platform-badge';
import type { SocialPlatform } from '@/lib/types/reporting';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

interface Snapshot {
  id: string;
  competitor_id: string;
  followers: number;
  following: number;
  posts_count: number;
  avg_engagement_rate: number;
  avg_views: number;
  total_likes: number;
  total_comments: number;
  recent_videos: { id: string; description: string; views: number; likes: number; comments: number }[];
  content_topics: { tag: string; count: number }[];
  scraped_at: string;
}

interface Competitor {
  id: string;
  client_id: string;
  platform: string;
  profile_url: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  latestSnapshot: Snapshot | null;
  snapshots: Snapshot[];
}

interface ResolvedSocials {
  kind: 'socials';
  domain: string;
  website_url: string;
  socials: Array<{ platform: string; username: string; profile_url: string }>;
}

interface BenchmarkingDashboardProps {
  clientId: string;
  clientName: string;
}

export function BenchmarkingDashboard({ clientId }: BenchmarkingDashboardProps) {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<ResolvedSocials | null>(null);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(new Set());
  const [discovering, setDiscovering] = useState(false);
  const [suggestions, setSuggestions] = useState<{ username: string; reason: string }[] | null>(null);

  const fetchCompetitors = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/competitors?client_id=${clientId}`);
      if (res.ok) {
        const data = await res.json();
        setCompetitors(data.competitors ?? []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => {
    fetchCompetitors();
  }, [fetchCompetitors]);

  async function handleResolve() {
    const raw = addInput.trim();
    if (!raw) return;
    setResolving(true);
    setResolved(null);
    try {
      const res = await fetch('/api/analytics/competitors/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, input: raw }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Could not parse that input');
        return;
      }
      if (data.kind === 'profile') {
        // Direct social URL — skip the picker and add straight away.
        await addProfile(data.platform, data.username, data.profile_url);
        setAddInput('');
        setShowAddForm(false);
      } else {
        setResolved(data);
        // Default the selection to TikTok + IG (the platforms most clients
        // care about), falling back to "everything" if neither exists on the
        // site. Keyed by `${platform}-${username}` to match the picker below.
        const defaults = new Set<string>();
        const socials = (data.socials ?? []) as ResolvedSocials['socials'];
        const preferred = socials.filter((s) => s.platform === 'tiktok' || s.platform === 'instagram');
        const seed = preferred.length > 0 ? preferred : socials;
        for (const s of seed) defaults.add(`${s.platform}-${s.username}`);
        setSelectedProfiles(defaults);
        if (socials.length === 0) {
          toast.message('No social profiles found on that site.');
        }
      }
    } catch {
      toast.error('Failed to resolve input');
    } finally {
      setResolving(false);
    }
  }

  async function addProfile(platform: string, username: string, profileUrl: string) {
    setAdding(true);
    try {
      const res = await fetch('/api/analytics/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          profile_url: profileUrl,
          platform,
          username,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to add');
        return;
      }
      toast.success(`@${username} added`);
      await fetchCompetitors();
    } catch {
      toast.error('Failed to add');
    } finally {
      setAdding(false);
    }
  }

  async function handleAddFromSuggestion(username: string) {
    await addProfile('tiktok', username, `https://www.tiktok.com/@${username}`);
    setSuggestions(prev => prev?.filter(s => s.username !== username) ?? null);
  }

  function toggleResolvedProfile(platform: string, username: string) {
    const key = `${platform}-${username}`;
    setSelectedProfiles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleBulkAddResolved() {
    if (!resolved || selectedProfiles.size === 0) return;
    const picks = resolved.socials.filter((s) =>
      selectedProfiles.has(`${s.platform}-${s.username}`),
    );
    if (picks.length === 0) return;

    setAdding(true);
    let added = 0;
    let duplicates = 0;
    let failed = 0;
    for (const s of picks) {
      try {
        const res = await fetch('/api/analytics/competitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            profile_url: s.profile_url,
            platform: s.platform,
            username: s.username,
          }),
        });
        if (res.ok) {
          added++;
          toast.success(`@${s.username} added`);
        } else if (res.status === 409) {
          duplicates++;
          toast.info(`@${s.username} already tracked`);
        } else {
          failed++;
          const data = await res.json().catch(() => ({ error: 'Failed to add' }));
          toast.error(`@${s.username}: ${data.error ?? 'failed'}`);
        }
      } catch {
        failed++;
        toast.error(`@${s.username}: network error`);
      }
    }
    setAdding(false);

    // Tally line so the user gets a single summary after the per-item toasts.
    const parts = [
      added > 0 ? `${added} added` : null,
      duplicates > 0 ? `${duplicates} already tracked` : null,
      failed > 0 ? `${failed} failed` : null,
    ].filter(Boolean);
    if (parts.length > 0) toast.message(parts.join(' · '));

    if (added > 0 || duplicates > 0) {
      await fetchCompetitors();
      setShowAddForm(false);
      setAddInput('');
      setResolved(null);
      setSelectedProfiles(new Set());
    }
  }

  async function handleRefresh(competitorId: string) {
    setRefreshingId(competitorId);
    try {
      const res = await fetch(`/api/analytics/competitors/${competitorId}/refresh`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Refresh failed');
        return;
      }
      toast.success('Snapshot updated');
      await fetchCompetitors();
    } catch {
      toast.error('Refresh failed');
    } finally {
      setRefreshingId(null);
    }
  }

  async function handleDelete(competitorId: string) {
    try {
      await fetch(`/api/analytics/competitors?id=${competitorId}`, { method: 'DELETE' });
      toast.success('Competitor removed');
      setCompetitors(prev => prev.filter(c => c.id !== competitorId));
    } catch {
      toast.error('Failed to remove');
    }
  }

  async function handleDiscover() {
    setDiscovering(true);
    setSuggestions(null);
    try {
      const res = await fetch('/api/analytics/competitors/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Discovery failed');
        return;
      }
      setSuggestions(data.suggestions ?? []);
    } catch {
      toast.error('Discovery failed');
    } finally {
      setDiscovering(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  // Build historical chart data from all snapshots
  const chartData = buildChartData(competitors);

  return (
    <div className="space-y-6">
      {/* Actions bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
          <Plus size={14} /> Add competitor
        </Button>
        <Button variant="outline" size="sm" onClick={handleDiscover} disabled={discovering}>
          {discovering ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Discover with AI
        </Button>
      </div>

      {/* Unified add form — accepts a social URL OR a website domain.
          A website gets crawled for socials, then the user picks. */}
      {showAddForm && (
        <div className="rounded-xl border border-nativz-border bg-surface p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Globe size={14} className="text-text-muted shrink-0" />
            <input
              type="text"
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              placeholder="Website (acme.com) or social URL (tiktok.com/@brand)"
              className="flex-1 rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && !resolving) void handleResolve(); }}
            />
            <Button size="sm" onClick={handleResolve} disabled={resolving || !addInput.trim()}>
              {resolving ? <Loader2 size={14} className="animate-spin" /> : 'Find'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setShowAddForm(false); setAddInput(''); setResolved(null); }}
            >
              <X size={14} />
            </Button>
          </div>

          {resolved && resolved.kind === 'socials' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-text-muted">
                  Found <span className="text-text-secondary">{resolved.socials.length}</span>{' '}
                  socials on <span className="text-text-secondary">{resolved.domain}</span>
                </p>
                {resolved.socials.length > 0 && (
                  <button
                    type="button"
                    className="text-[11px] text-accent-text hover:text-accent"
                    onClick={() => {
                      const all = new Set(resolved.socials.map((s) => `${s.platform}-${s.username}`));
                      setSelectedProfiles(
                        selectedProfiles.size === all.size ? new Set() : all,
                      );
                    }}
                  >
                    {selectedProfiles.size === resolved.socials.length ? 'Clear all' : 'Select all'}
                  </button>
                )}
              </div>
              {resolved.socials.length === 0 ? (
                <p className="text-xs text-text-muted">No social profiles on that page.</p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    {resolved.socials.map((s) => {
                      const key = `${s.platform}-${s.username}`;
                      const checked = selectedProfiles.has(key);
                      return (
                        <label
                          key={key}
                          className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
                            checked
                              ? 'border-accent/40 bg-accent-surface/20'
                              : 'border-nativz-border bg-background hover:border-nativz-border/80'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleResolvedProfile(s.platform, s.username)}
                              className="h-3.5 w-3.5 cursor-pointer rounded border-nativz-border bg-background accent-accent"
                            />
                            <PlatformBadge
                              platform={s.platform as SocialPlatform}
                              size="sm"
                              showLabel={false}
                            />
                            <span className="text-sm text-text-primary">@{s.username}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <Button
                    size="sm"
                    disabled={adding || selectedProfiles.size === 0}
                    onClick={() => void handleBulkAddResolved()}
                    className="w-full"
                  >
                    {adding ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Check size={12} />
                    )}
                    Add {selectedProfiles.size || ''} competitor{selectedProfiles.size === 1 ? '' : 's'}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* AI suggestions */}
      {suggestions && suggestions.length > 0 && (
        <div className="rounded-xl border border-accent/20 bg-accent-surface/5 p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
            <Sparkles size={14} className="text-accent-text" />
            Suggested competitors
          </h3>
          <div className="space-y-2">
            {suggestions.map(s => (
              <div key={s.username} className="flex items-center gap-3 rounded-lg border border-nativz-border bg-surface p-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-primary">@{s.username}</p>
                  <p className="text-xs text-text-muted">{s.reason}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleAddFromSuggestion(s.username)} disabled={adding}>
                  <Plus size={12} /> Add
                </Button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setSuggestions(null)}
            className="mt-2 text-xs text-text-muted hover:text-text-secondary cursor-pointer"
          >
            Dismiss suggestions
          </button>
        </div>
      )}

      {/* Historical chart */}
      {chartData.length > 1 && (
        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <BarChart3 size={14} className="text-text-muted" />
            Follower growth over time
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  {competitors.map((comp, i) => (
                    <linearGradient key={comp.id} id={`color-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--nativz-border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatNumber(v)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--nativz-border)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: 'var(--text-primary)' }}
                  formatter={(value: number | undefined) => [formatNumber(value ?? 0), '']}
                />
                {competitors.map((comp, i) => (
                  <Area
                    key={comp.id}
                    type="monotone"
                    dataKey={comp.username}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    fillOpacity={1}
                    fill={`url(#color-${i})`}
                    strokeWidth={2}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Competitor cards */}
      {competitors.length === 0 ? (
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <Users size={32} className="text-text-muted mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-text-primary">No competitors tracked yet</h3>
          <p className="text-xs text-text-muted mt-1">
            Add competitors manually or use AI to discover them
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {competitors.map((comp) => (
            <CompetitorCard
              key={comp.id}
              competitor={comp}
              refreshing={refreshingId === comp.id}
              onRefresh={() => handleRefresh(comp.id)}
              onDelete={() => handleDelete(comp.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const CHART_COLORS = ['#5BA3E6', '#A78BFA', '#34D399', '#F97316', '#EC4899', '#14B8A6'];

function CompetitorCard({
  competitor,
  refreshing,
  onRefresh,
  onDelete,
}: {
  competitor: Competitor;
  refreshing: boolean;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const snap = competitor.latestSnapshot;

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {competitor.avatar_url ? (
            <img src={competitor.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-full bg-surface-hover flex items-center justify-center">
              <Users size={16} className="text-text-muted" />
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-text-primary flex items-center gap-2">
              {competitor.display_name ?? competitor.username}
              <PlatformBadge
                platform={(competitor.platform ?? 'tiktok') as SocialPlatform}
                size="sm"
                showLabel={false}
              />
            </p>
            <a
              href={competitor.profile_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent-text hover:underline flex items-center gap-1"
            >
              @{competitor.username} <ExternalLink size={10} />
            </a>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing} title="Refresh data">
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} title="Remove competitor" className="text-text-muted hover:text-red-400">
            <Trash2 size={12} />
          </Button>
        </div>
      </div>

      {snap ? (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <MiniStat icon={Users} label="Followers" value={formatNumber(snap.followers)} />
            <MiniStat icon={Eye} label="Avg views" value={formatNumber(snap.avg_views)} />
            <MiniStat icon={TrendingUp} label="Engagement" value={`${(snap.avg_engagement_rate * 100).toFixed(2)}%`} />
          </div>

          {/* Top content topics */}
          {(snap.content_topics as { tag: string; count: number }[]).length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">Top topics</p>
              <div className="flex flex-wrap gap-1">
                {(snap.content_topics as { tag: string; count: number }[]).slice(0, 8).map(t => (
                  <span key={t.tag} className="text-[10px] text-accent-text bg-accent-surface/20 rounded-full px-2 py-0.5">
                    #{t.tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(() => {
            const ageMs = Date.now() - new Date(snap.scraped_at).getTime();
            const stale = ageMs > 7 * 24 * 60 * 60 * 1000;
            return (
              <p className={`text-[10px] ${stale ? 'text-amber-400' : 'text-text-muted'}`}>
                Last updated: {new Date(snap.scraped_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                {stale && <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 font-medium">stale</span>}
              </p>
            );
          })()}
        </>
      ) : (
        <div className="py-4 text-center">
          <p className="text-xs text-text-muted mb-2">No data yet</p>
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Fetch data
          </Button>
        </div>
      )}
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background px-2.5 py-2 border border-nativz-border">
      <div className="flex items-center gap-1 text-text-muted mb-0.5">
        <Icon size={10} />
        <span className="text-[9px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xs font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function buildChartData(competitors: Competitor[]): Record<string, unknown>[] {
  // Collect all snapshot dates across all competitors
  const dateMap: Record<string, Record<string, number>> = {};

  for (const comp of competitors) {
    for (const snap of comp.snapshots) {
      const date = new Date(snap.scraped_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
      if (!dateMap[date]) dateMap[date] = {};
      dateMap[date][comp.username] = snap.followers;
    }
  }

  return Object.entries(dateMap)
    .map(([date, values]) => ({ date, ...values }))
    .sort((a, b) => {
      // Sort chronologically
      const da = new Date(a.date as string);
      const db = new Date(b.date as string);
      return da.getTime() - db.getTime();
    });
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
