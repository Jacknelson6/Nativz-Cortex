'use client';

import { useState } from 'react';
import {
  ArrowLeft, Save, Loader2, Search, RefreshCw, Globe, ExternalLink,
  Users, Eye, Heart, MessageCircle, TrendingUp, Zap, Clock,
  Instagram, Youtube, Facebook, Twitter, BarChart3, ChevronRight,
  Lightbulb, Target, Palette, CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { AuditData, PresentationData, ProspectAuditData } from './types';

// ─── Platform config ────────────────────────────────────────────────────────

const PLATFORM_CONFIG: Record<string, { label: string; icon: typeof Globe; color: string }> = {
  instagram: { label: 'Instagram', icon: Instagram, color: '#E1306C' },
  youtube: { label: 'YouTube', icon: Youtube, color: '#FF0000' },
  tiktok: { label: 'TikTok', icon: BarChart3, color: '#00F2EA' },
  twitter: { label: 'X / Twitter', icon: Twitter, color: '#1DA1F2' },
  facebook: { label: 'Facebook', icon: Facebook, color: '#1877F2' },
  website: { label: 'Website', icon: Globe, color: '#06b6d4' },
};

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  S: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
  A: { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  B: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  C: { bg: 'bg-green-500/15', text: 'text-green-400', border: 'border-green-500/30' },
  D: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
};

const EFFECTIVENESS_COLORS: Record<string, string> = {
  high: 'text-emerald-400',
  medium: 'text-yellow-400',
  low: 'text-red-400',
};

// ─── Editor component ────────────────────────────────────────────────────────

export function ProspectAuditEditor({
  presentation, saving, update, onSave, onBack,
}: {
  presentation: PresentationData;
  saving: boolean;
  clients: import('@/components/ui/client-picker').ClientOption[];
  update: (partial: Partial<PresentationData>) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const audit = (presentation.audit_data as unknown as ProspectAuditData) ?? {
    url: '',
    status: 'idle' as const,
    profile: null,
    content_pillars: [],
    visual_styles: [],
    posting_cadence: null,
    hook_strategies: [],
    recommendations: [],
    scraped_content: [],
    analyzed_at: null,
  };

  const [urlInput, setUrlInput] = useState(audit.url ?? '');
  const [running, setRunning] = useState(audit.status === 'running');

  async function runAudit() {
    if (!urlInput.trim()) {
      toast.error('Enter a URL to audit');
      return;
    }
    setRunning(true);
    try {
      const res = await fetch(`/api/presentations/${presentation.id}/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Audit failed' }));
        throw new Error(err.error ?? 'Audit failed');
      }
      const data = await res.json();
      update({ audit_data: data.audit_data });
      toast.success('Audit complete');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Audit failed');
    } finally {
      setRunning(false);
    }
  }

  function formatNumber(n: number | null | undefined): string {
    if (n == null) return '\u2014';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  }

  // ── Idle / input state ──
  if (audit.status === 'idle' || audit.status === 'error' || !audit.profile) {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-nativz-border px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover transition-colors">
              <ArrowLeft size={18} />
            </button>
            <input
              type="text"
              value={presentation.title}
              onChange={(e) => update({ title: e.target.value })}
              className="bg-transparent text-lg font-bold text-foreground border-none outline-none placeholder:text-foreground/30 min-w-0 flex-1"
              placeholder="Prospect audit title..."
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">{saving ? 'Saving...' : 'Saved'}</span>
            <Button variant="ghost" size="sm" onClick={onSave}><Save size={14} /> Save</Button>
          </div>
        </div>

        {/* Setup */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-xl mx-auto space-y-8 mt-12">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/15 flex items-center justify-center mx-auto">
                <Search size={28} className="text-cyan-400" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Prospect audit</h1>
              <p className="text-sm text-text-muted max-w-md mx-auto">
                Enter a prospect&apos;s social media URL or website. We&apos;ll analyze their content strategy, identify their pillars, and generate recommendations.
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-text-primary block">Prospect URL</label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') runAudit(); }}
                    placeholder="instagram.com/prospect, tiktok.com/@prospect, or any URL..."
                    className="w-full rounded-lg border border-nativz-border bg-surface-hover pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-colors"
                  />
                </div>
                <Button
                  onClick={runAudit}
                  disabled={running || !urlInput.trim()}
                  className="shrink-0"
                >
                  {running ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  {running ? 'Analyzing...' : 'Run audit'}
                </Button>
              </div>
              <p className="text-xs text-text-muted">Supports Instagram, TikTok, YouTube, Facebook, X, or any website</p>
            </div>

            {audit.status === 'error' && audit.error_message && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                <p className="text-sm text-red-400">{audit.error_message}</p>
                <p className="text-xs text-text-muted mt-1">Try a different URL or run the audit again.</p>
              </div>
            )}

            {running && (
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-6 text-center space-y-3">
                <Loader2 size={24} className="text-cyan-400 animate-spin mx-auto" />
                <div>
                  <p className="text-sm font-medium text-foreground">Analyzing prospect...</p>
                  <p className="text-xs text-text-muted mt-1">Scraping profile data, searching for content, and running AI analysis. This may take up to a minute.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Results state ──
  const profile = audit.profile;
  const platConfig = PLATFORM_CONFIG[profile?.platform ?? 'website'] ?? PLATFORM_CONFIG.website;
  const PlatIcon = platConfig.icon;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-nativz-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover transition-colors">
            <ArrowLeft size={18} />
          </button>
          <input
            type="text"
            value={presentation.title}
            onChange={(e) => update({ title: e.target.value })}
            className="bg-transparent text-lg font-bold text-foreground border-none outline-none placeholder:text-foreground/30 min-w-0 flex-1"
            placeholder="Prospect audit title..."
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{saving ? 'Saving...' : 'Saved'}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              update({ audit_data: { ...audit, status: 'idle', profile: null } as unknown as AuditData });
            }}
          >
            <RefreshCw size={14} /> Edit URL
          </Button>
          <Button variant="ghost" size="sm" onClick={runAudit} disabled={running}>
            {running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Re-run
          </Button>
          <Button variant="ghost" size="sm" onClick={onSave}><Save size={14} /> Save</Button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* ── Profile overview card ── */}
          <div className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
            <div className="px-6 py-5 flex items-center gap-4" style={{ backgroundColor: platConfig.color + '08' }}>
              {profile?.profile_image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.profile_image} alt="" className="w-14 h-14 rounded-xl object-cover" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-foreground truncate">{profile?.name ?? 'Unknown'}</h2>
                  <div className="flex items-center gap-1 rounded-full px-2.5 py-0.5" style={{ backgroundColor: platConfig.color + '20' }}>
                    <PlatIcon size={12} style={{ color: platConfig.color }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: platConfig.color }}>{platConfig.label}</span>
                  </div>
                </div>
                {profile?.handle && (
                  <p className="text-sm text-text-muted">@{profile.handle}</p>
                )}
                {profile?.bio && (
                  <p className="text-xs text-text-muted mt-1 line-clamp-2">{profile.bio}</p>
                )}
              </div>
              <a
                href={profile?.url ?? audit.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
              >
                <ExternalLink size={16} />
              </a>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 divide-x divide-nativz-border border-t border-nativz-border">
              <StatCell icon={Users} label="Followers" value={formatNumber(profile?.followers)} />
              <StatCell icon={Eye} label="Posts" value={formatNumber(profile?.posts)} />
              <StatCell icon={Heart} label="Engagement" value={profile?.engagement_rate != null ? `${profile.engagement_rate}%` : '\u2014'} />
              <StatCell icon={MessageCircle} label="Following" value={formatNumber(profile?.following)} />
            </div>
          </div>

          {/* ── Two-column layout ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Content pillars */}
            <div className="rounded-2xl border border-nativz-border bg-surface p-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                  <Target size={16} className="text-cyan-400" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Content pillars</h3>
              </div>
              {(audit.content_pillars ?? []).length > 0 ? (
                <div className="space-y-2">
                  {audit.content_pillars.map((pillar, i) => {
                    const tierStyle = TIER_COLORS[pillar.tier] ?? TIER_COLORS.B;
                    return (
                      <div key={i} className="flex items-center gap-3 rounded-xl border border-nativz-border bg-background px-4 py-3">
                        <div className={`w-8 h-8 rounded-lg ${tierStyle.bg} border ${tierStyle.border} flex items-center justify-center shrink-0`}>
                          <span className={`text-xs font-bold ${tierStyle.text}`}>{pillar.tier}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{pillar.name}</p>
                          <p className="text-[11px] text-text-muted truncate">{pillar.description}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-foreground">{pillar.post_count} posts</p>
                          <p className="text-[10px] text-text-muted">{pillar.avg_engagement}% eng</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-text-muted">No content pillars identified</p>
              )}
            </div>

            {/* Visual styles */}
            <div className="rounded-2xl border border-nativz-border bg-surface p-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
                  <Palette size={16} className="text-purple-400" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Visual styles</h3>
              </div>
              {(audit.visual_styles ?? []).length > 0 ? (
                <div className="space-y-3">
                  {audit.visual_styles.map((style, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-foreground">{style.style}</span>
                        <span className="text-xs font-bold text-text-muted">{style.frequency_pct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-background overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, style.frequency_pct)}%`,
                            backgroundColor: [
                              '#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444',
                            ][i % 5],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted">No visual styles identified</p>
              )}
            </div>

            {/* Posting cadence */}
            <div className="rounded-2xl border border-nativz-border bg-surface p-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <CalendarDays size={16} className="text-amber-400" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Posting cadence</h3>
              </div>
              {audit.posting_cadence ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-nativz-border bg-background p-3 text-center">
                      <p className="text-2xl font-bold text-foreground">{audit.posting_cadence.posts_per_week}</p>
                      <p className="text-[10px] text-text-muted uppercase tracking-wider">Posts / week</p>
                    </div>
                    <div className="rounded-xl border border-nativz-border bg-background p-3 text-center">
                      <p className="text-2xl font-bold text-foreground">{audit.posting_cadence.consistency_score}<span className="text-sm text-text-muted">/10</span></p>
                      <p className="text-[10px] text-text-muted uppercase tracking-wider">Consistency</p>
                    </div>
                  </div>
                  {audit.posting_cadence.best_days.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-text-muted mb-1.5">Best days</p>
                      <div className="flex flex-wrap gap-1.5">
                        {audit.posting_cadence.best_days.map((day) => (
                          <span key={day} className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-[11px] font-medium text-amber-400">
                            {day}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {audit.posting_cadence.best_times.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-text-muted mb-1.5">Best times</p>
                      <div className="flex flex-wrap gap-1.5">
                        {audit.posting_cadence.best_times.map((time) => (
                          <span key={time} className="rounded-full bg-surface-hover border border-nativz-border px-2.5 py-0.5 text-[11px] text-text-secondary">
                            <Clock size={10} className="inline mr-1" />{time}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-text-muted">No cadence data available</p>
              )}
            </div>

            {/* Hook strategies */}
            <div className="rounded-2xl border border-nativz-border bg-surface p-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <Zap size={16} className="text-emerald-400" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Hook strategies</h3>
              </div>
              {(audit.hook_strategies ?? []).length > 0 ? (
                <div className="space-y-2">
                  {audit.hook_strategies.map((hook, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-xl border border-nativz-border bg-background px-4 py-3">
                      <div className="shrink-0 mt-0.5">
                        <ChevronRight size={14} className={EFFECTIVENESS_COLORS[hook.effectiveness] ?? 'text-text-muted'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{hook.strategy}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${EFFECTIVENESS_COLORS[hook.effectiveness] ?? 'text-text-muted'}`}>
                            {hook.effectiveness}
                          </span>
                          <span className="text-[10px] text-text-muted">{hook.frequency_pct}% of content</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted">No hook strategies identified</p>
              )}
            </div>
          </div>

          {/* ── Recommendations ── */}
          {(audit.recommendations ?? []).length > 0 && (
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.03] p-6 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                  <Lightbulb size={16} className="text-cyan-400" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Recommendations</h3>
                <span className="text-xs text-text-muted ml-auto">What Nativz can pitch</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {audit.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl border border-nativz-border bg-surface px-4 py-3">
                    <div className="w-6 h-6 rounded-full bg-cyan-500/15 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-cyan-400">{i + 1}</span>
                    </div>
                    <p className="text-sm text-text-secondary">{rec}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Analysis timestamp ── */}
          {audit.analyzed_at && (
            <p className="text-xs text-text-muted text-center">
              Analyzed {new Date(audit.analyzed_at).toLocaleString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stat cell ───────────────────────────────────────────────────────────────

function StatCell({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="px-4 py-3 text-center">
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <Icon size={12} className="text-text-muted" />
        <span className="text-[10px] text-text-muted uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className="text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}
