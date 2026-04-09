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
} from 'lucide-react';
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

interface BenchmarkingDashboardProps {
  clientId: string;
  clientName: string;
}

export function BenchmarkingDashboard({ clientId }: BenchmarkingDashboardProps) {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [adding, setAdding] = useState(false);
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

  async function handleAdd() {
    if (!addUrl.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/analytics/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, profile_url: addUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to add');
        return;
      }
      toast.success('Competitor added');
      setAddUrl('');
      setShowAddForm(false);
      await fetchCompetitors();
    } catch {
      toast.error('Failed to add competitor');
    } finally {
      setAdding(false);
    }
  }

  async function handleAddFromSuggestion(username: string) {
    setAdding(true);
    try {
      const res = await fetch('/api/analytics/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, profile_url: `https://www.tiktok.com/@${username}` }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to add');
        return;
      }
      toast.success(`@${username} added`);
      setSuggestions(prev => prev?.filter(s => s.username !== username) ?? null);
      await fetchCompetitors();
    } catch {
      toast.error('Failed to add');
    } finally {
      setAdding(false);
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

      {/* Add form */}
      {showAddForm && (
        <div className="rounded-xl border border-nativz-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              placeholder="TikTok profile URL (e.g. tiktok.com/@brand)"
              className="flex-1 rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
            />
            <Button size="sm" onClick={handleAdd} disabled={adding || !addUrl.trim()}>
              {adding ? <Loader2 size={14} className="animate-spin" /> : 'Add'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowAddForm(false); setAddUrl(''); }}>
              <X size={14} />
            </Button>
          </div>
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
            <p className="text-sm font-medium text-text-primary">
              {competitor.display_name ?? competitor.username}
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

          <p className="text-[10px] text-text-muted">
            Last updated: {new Date(snap.scraped_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
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
