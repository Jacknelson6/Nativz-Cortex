'use client';

import { useState, useCallback } from 'react';
import {
  Search, Loader2, Globe, Users, Eye, Heart, MessageCircle,
  TrendingUp, Zap, Clock, Lightbulb, Target, ChevronRight,
  BarChart3, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ContentPillar {
  name: string;
  description: string;
  post_count: number;
  avg_engagement: number;
  tier: 'S' | 'A' | 'B' | 'C' | 'D';
}

interface HookStrategy {
  strategy: string;
  frequency_pct: number;
  effectiveness: 'high' | 'medium' | 'low';
}

interface PostingCadence {
  posts_per_week: number;
  best_days: string[];
  best_times: string[];
  consistency_score: number;
}

interface AuditResult {
  profile: {
    name: string;
    handle: string;
    platform: string;
    bio: string;
    followers: number | null;
    following: number | null;
    posts: number | null;
    engagement_rate: number | null;
    profile_image: string | null;
    url: string;
  } | null;
  content_pillars: ContentPillar[];
  posting_cadence: PostingCadence | null;
  hook_strategies: HookStrategy[];
  recommendations: string[];
}

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  S: { bg: 'bg-red-500/15', text: 'text-red-400' },
  A: { bg: 'bg-orange-500/15', text: 'text-orange-400' },
  B: { bg: 'bg-yellow-500/15', text: 'text-yellow-400' },
  C: { bg: 'bg-green-500/15', text: 'text-green-400' },
  D: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
};

const EFFECTIVENESS_COLORS: Record<string, string> = {
  high: 'text-emerald-400',
  medium: 'text-yellow-400',
  low: 'text-text-muted',
};

function formatNumber(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function StrategyLabProspectAudit({ clientId }: { clientId: string }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);

  const runAudit = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/strategy-lab/prospect-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), clientId }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Error ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Audit failed');
    } finally {
      setLoading(false);
    }
  }, [url, clientId]);

  return (
    <div className="space-y-6">
      {/* URL input */}
      <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Prospect audit</h3>
          <p className="text-sm text-text-muted mt-1">
            Enter a social media profile URL to analyze their content strategy, posting cadence, and hooks.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runAudit()}
              placeholder="https://instagram.com/username or TikTok URL"
              className="w-full rounded-lg border border-nativz-border bg-background pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
            />
          </div>
          <Button onClick={runAudit} disabled={loading || !url.trim()}>
            {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : <Search size={16} className="mr-2" />}
            {loading ? 'Analyzing...' : 'Audit'}
          </Button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-5">
          {/* Profile header */}
          {result.profile && (
            <div className="rounded-xl border border-nativz-border bg-surface p-5">
              <div className="flex items-center gap-4">
                {result.profile.profile_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={result.profile.profile_image} alt="" className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pink-600/20 text-pink-400 text-xl font-bold">
                    {(result.profile.name || '?')[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-text-primary truncate">{result.profile.name}</h3>
                  <p className="text-sm text-text-muted">@{result.profile.handle}</p>
                  {result.profile.bio && (
                    <p className="text-sm text-text-secondary mt-1 line-clamp-2">{result.profile.bio}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-6 mt-4 pt-4 border-t border-nativz-border">
                <div className="text-center">
                  <p className="text-lg font-bold text-text-primary">{formatNumber(result.profile.followers)}</p>
                  <p className="text-xs text-text-muted">Followers</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-text-primary">{formatNumber(result.profile.following)}</p>
                  <p className="text-xs text-text-muted">Following</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-text-primary">{formatNumber(result.profile.posts)}</p>
                  <p className="text-xs text-text-muted">Posts</p>
                </div>
                {result.profile.engagement_rate != null && (
                  <div className="text-center">
                    <p className="text-lg font-bold text-emerald-400">{(result.profile.engagement_rate * 100).toFixed(2)}%</p>
                    <p className="text-xs text-text-muted">Engagement</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Content pillars */}
          {result.content_pillars.length > 0 && (
            <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
              <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Target size={16} className="text-pink-400" />
                Content pillars
              </h4>
              <div className="space-y-2">
                {result.content_pillars.map((p) => {
                  const tier = TIER_COLORS[p.tier] ?? TIER_COLORS.C;
                  return (
                    <div key={p.name} className="flex items-center gap-3 rounded-lg border border-nativz-border/50 bg-background/30 px-4 py-3">
                      <span className={`${tier.bg} ${tier.text} text-xs font-bold px-2 py-0.5 rounded`}>{p.tier}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary">{p.name}</p>
                        <p className="text-xs text-text-muted truncate">{p.description}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-text-primary">{p.post_count} posts</p>
                        <p className="text-xs text-text-muted">{(p.avg_engagement * 100).toFixed(1)}% eng</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Posting cadence */}
          {result.posting_cadence && (
            <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
              <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Clock size={16} className="text-cyan-400" />
                Posting cadence
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-nativz-border/50 bg-background/30 p-3">
                  <p className="text-2xl font-bold text-text-primary">{result.posting_cadence.posts_per_week}</p>
                  <p className="text-xs text-text-muted">Posts per week</p>
                </div>
                <div className="rounded-lg border border-nativz-border/50 bg-background/30 p-3">
                  <p className="text-2xl font-bold text-text-primary">{Math.round(result.posting_cadence.consistency_score * 100)}%</p>
                  <p className="text-xs text-text-muted">Consistency</p>
                </div>
              </div>
              <div className="flex gap-4 text-sm text-text-secondary">
                <span>Best days: {result.posting_cadence.best_days.join(', ')}</span>
                <span>Best times: {result.posting_cadence.best_times.join(', ')}</span>
              </div>
            </div>
          )}

          {/* Hook strategies */}
          {result.hook_strategies.length > 0 && (
            <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
              <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Zap size={16} className="text-yellow-400" />
                Hook strategies
              </h4>
              <div className="space-y-2">
                {result.hook_strategies.map((h) => (
                  <div key={h.strategy} className="flex items-center justify-between rounded-lg border border-nativz-border/50 bg-background/30 px-4 py-2.5">
                    <span className="text-sm text-text-primary">{h.strategy}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-text-muted">{h.frequency_pct}%</span>
                      <span className={`text-xs font-medium ${EFFECTIVENESS_COLORS[h.effectiveness]}`}>
                        {h.effectiveness}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
              <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Lightbulb size={16} className="text-emerald-400" />
                Recommendations
              </h4>
              <ul className="space-y-2">
                {result.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                    <ChevronRight size={14} className="text-text-muted mt-0.5 shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
