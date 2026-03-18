'use client';

import { useState } from 'react';
import {
  ArrowLeft, Save, Pencil, Check, ChevronRight, TrendingUp,
  Users, Eye, Heart, MessageCircle, Loader2, BarChart3,
  Instagram, Youtube, Twitter, Facebook,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { AuditData, PresentationData } from './types';

// ─── Social Audit Editor ─────────────────────────────────────────────────────

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: Instagram, color: '#E1306C' },
  { id: 'youtube', label: 'YouTube', icon: Youtube, color: '#FF0000' },
  { id: 'tiktok', label: 'TikTok', icon: BarChart3, color: '#00F2EA' },
  { id: 'twitter', label: 'X / Twitter', icon: Twitter, color: '#1DA1F2' },
  { id: 'facebook', label: 'Facebook', icon: Facebook, color: '#1877F2' },
] as const;

export function SocialAuditEditor({
  presentation, saving, clients, update, onSave, onBack,
}: {
  presentation: PresentationData;
  saving: boolean;
  clients: import('@/components/ui/client-picker').ClientOption[];
  update: (partial: Partial<PresentationData>) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const audit = presentation.audit_data ?? { profiles: [], competitors: [], projections: {}, step: 'wizard' };
  const [handles, setHandles] = useState<Record<string, string>>({});
  const [compHandles, setCompHandles] = useState<Record<string, string>>({});
  const [scraping, setScraping] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState(audit.business_name ?? '');
  const [timelineMonths, setTimelineMonths] = useState(audit.timeline_months ?? 3);

  function updateAudit(partial: Partial<AuditData>) {
    update({ audit_data: { ...audit, ...partial } });
  }

  async function scrapeProfile(platform: string, handle: string, isCompetitor: boolean) {
    if (!handle.trim()) return;
    setScraping(`${isCompetitor ? 'comp-' : ''}${platform}`);
    try {
      const res = await fetch('/api/presentations/scrape-social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, handle: handle.trim() }),
      });
      if (!res.ok) throw new Error();
      const profile = await res.json();

      if (isCompetitor) {
        const existing = audit.competitors.filter((p) => !(p.platform === platform && p.handle === profile.handle));
        updateAudit({ competitors: [...existing, profile] });
      } else {
        const existing = audit.profiles.filter((p) => p.platform !== platform);
        updateAudit({ profiles: [...existing, profile] });
      }
      toast.success(`${platform} profile scraped`);
    } catch {
      toast.error(`Failed to scrape ${platform} profile`);
    } finally {
      setScraping(null);
    }
  }

  function generateProjections() {
    const projections: Record<string, { followers_3mo: number; engagement_3mo: number; posts_per_week: number }> = {};
    const months = timelineMonths;

    for (const profile of audit.profiles) {
      const currentFollowers = profile.followers ?? 0;
      const currentEngagement = profile.engagement_rate ?? 2;

      // Growth rates based on platform and professional content strategy
      const growthRates: Record<string, { followerGrowth: number; engagementBoost: number; postsPerWeek: number }> = {
        instagram: { followerGrowth: 0.15, engagementBoost: 1.8, postsPerWeek: 5 },
        youtube: { followerGrowth: 0.12, engagementBoost: 1.5, postsPerWeek: 3 },
        tiktok: { followerGrowth: 0.25, engagementBoost: 2.0, postsPerWeek: 7 },
        twitter: { followerGrowth: 0.08, engagementBoost: 1.3, postsPerWeek: 10 },
        facebook: { followerGrowth: 0.06, engagementBoost: 1.2, postsPerWeek: 4 },
      };

      const rates = growthRates[profile.platform] ?? growthRates.instagram;
      const monthlyGrowth = rates.followerGrowth / 3; // per month

      projections[profile.platform] = {
        followers_3mo: Math.round(currentFollowers * (1 + monthlyGrowth * months)),
        engagement_3mo: Math.round(currentEngagement * rates.engagementBoost * 10) / 10,
        posts_per_week: rates.postsPerWeek,
      };
    }

    updateAudit({
      projections,
      business_name: businessName,
      timeline_months: timelineMonths,
      step: 'review',
    });
  }

  function formatNumber(n: number | null | undefined): string {
    if (n == null) return '\u2014';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  }

  // ── Wizard step ──
  if (audit.step === 'wizard') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between border-b border-nativz-border px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover transition-colors"><ArrowLeft size={18} /></button>
            <h1 className="text-lg font-bold text-white">Social audit setup</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">{saving ? 'Saving...' : 'Saved'}</span>
            <Button variant="ghost" size="sm" onClick={onSave}><Save size={14} /> Save</Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-8">
            {/* Business name + timeline */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-text-primary block mb-2">Business / prospect name</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Joe's Gym, Acme Corp..."
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-primary block mb-2">Projection timeline</label>
                <div className="flex gap-2">
                  {[3, 6, 12].map((m) => (
                    <button
                      key={m}
                      onClick={() => setTimelineMonths(m)}
                      className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        timelineMonths === m
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'
                          : 'bg-white/[0.04] text-text-muted border border-white/10 hover:text-white'
                      }`}
                    >
                      {m} months
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Their profiles */}
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-white">Their social profiles</h2>
              <p className="text-sm text-text-muted">Enter the prospect&apos;s social media handles. We&apos;ll pull public data to build the before &amp; after.</p>
              <div className="space-y-2">
                {PLATFORMS.map(({ id, label, icon: Icon, color }) => {
                  const existing = audit.profiles.find((p) => p.platform === id);
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + '15' }}>
                        <Icon size={16} style={{ color }} />
                      </div>
                      <input
                        type="text"
                        value={handles[id] ?? existing?.handle ?? ''}
                        onChange={(e) => setHandles({ ...handles, [id]: e.target.value })}
                        placeholder={`${label} handle...`}
                        className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none transition-colors"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={scraping === id || !(handles[id] ?? existing?.handle)}
                        onClick={() => scrapeProfile(id, handles[id] ?? existing?.handle ?? '', false)}
                      >
                        {scraping === id ? <Loader2 size={14} className="animate-spin" /> : existing ? <Check size={14} className="text-emerald-400" /> : <ChevronRight size={14} />}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Scraped profiles preview */}
            {audit.profiles.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {audit.profiles.map((p) => {
                  const plat = PLATFORMS.find((pl) => pl.id === p.platform);
                  return (
                    <div key={p.platform} className="rounded-xl border border-nativz-border bg-surface p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        {p.profile_image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.profile_image} alt="" className="w-8 h-8 rounded-full object-cover" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white truncate">{p.display_name}</p>
                          <p className="text-[10px] text-text-muted">@{p.handle} · {plat?.label}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div><p className="text-sm font-bold text-white">{formatNumber(p.followers)}</p><p className="text-[10px] text-text-muted">Followers</p></div>
                        <div><p className="text-sm font-bold text-white">{formatNumber(p.posts)}</p><p className="text-[10px] text-text-muted">Posts</p></div>
                        <div><p className="text-sm font-bold text-white">{p.engagement_rate ? `${p.engagement_rate}%` : '\u2014'}</p><p className="text-[10px] text-text-muted">Eng. rate</p></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Competitor profiles */}
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-white">Competitor profiles <span className="text-text-muted font-normal">(optional)</span></h2>
              <p className="text-sm text-text-muted">Add competitor handles to show what&apos;s possible in their space.</p>
              <div className="space-y-2">
                {PLATFORMS.map(({ id, label, icon: Icon, color }) => {
                  const existing = audit.competitors.find((p) => p.platform === id);
                  return (
                    <div key={`comp-${id}`} className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + '15' }}>
                        <Icon size={16} style={{ color }} />
                      </div>
                      <input
                        type="text"
                        value={compHandles[id] ?? existing?.handle ?? ''}
                        onChange={(e) => setCompHandles({ ...compHandles, [id]: e.target.value })}
                        placeholder={`Competitor ${label} handle...`}
                        className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none transition-colors"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={scraping === `comp-${id}` || !(compHandles[id] ?? existing?.handle)}
                        onClick={() => scrapeProfile(id, compHandles[id] ?? existing?.handle ?? '', true)}
                      >
                        {scraping === `comp-${id}` ? <Loader2 size={14} className="animate-spin" /> : existing ? <Check size={14} className="text-emerald-400" /> : <ChevronRight size={14} />}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Generate button */}
            <div className="pt-4 border-t border-nativz-border">
              <Button
                onClick={generateProjections}
                disabled={audit.profiles.length === 0}
                className="w-full"
              >
                <TrendingUp size={16} />
                Generate before &amp; after
              </Button>
              {audit.profiles.length === 0 && (
                <p className="text-xs text-text-muted text-center mt-2">Scrape at least one profile to continue</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Review / Present step — Before & After ──
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between border-b border-nativz-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover transition-colors"><ArrowLeft size={18} /></button>
          <input type="text" value={presentation.title} onChange={(e) => update({ title: e.target.value })} className="bg-transparent text-lg font-bold text-white border-none outline-none placeholder:text-white/30 min-w-0 flex-1" placeholder="Social audit title..." />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{saving ? 'Saving...' : 'Saved'}</span>
          <Button variant="ghost" size="sm" onClick={() => updateAudit({ step: 'wizard' })}>
            <Pencil size={14} /> Edit data
          </Button>
          <Button variant="ghost" size="sm" onClick={onSave}><Save size={14} /> Save</Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-white">{audit.business_name || 'Social media'} audit</h1>
            <p className="text-text-muted">What your social presence looks like today vs. what it could look like in {timelineMonths} months with Nativz</p>
          </div>

          {/* Platform cards — before & after */}
          {audit.profiles.map((profile) => {
            const proj = audit.projections[profile.platform];
            const plat = PLATFORMS.find((p) => p.id === profile.platform);
            const competitor = audit.competitors.find((c) => c.platform === profile.platform);
            if (!plat) return null;

            const Icon = plat.icon;
            const followerGrowth = proj && profile.followers
              ? Math.round(((proj.followers_3mo - profile.followers) / profile.followers) * 100)
              : null;

            return (
              <div key={profile.platform} className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
                {/* Platform header */}
                <div className="px-6 py-4 border-b border-nativz-border flex items-center gap-3" style={{ backgroundColor: plat.color + '08' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: plat.color + '20' }}>
                    <Icon size={20} style={{ color: plat.color }} />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-white">{plat.label}</h2>
                    <p className="text-xs text-text-muted">@{profile.handle}</p>
                  </div>
                  {profile.profile_image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.profile_image} alt="" className="w-10 h-10 rounded-full object-cover ml-auto" />
                  )}
                </div>

                {/* Before / After columns */}
                <div className="grid grid-cols-2 divide-x divide-nativz-border">
                  {/* BEFORE (current) */}
                  <div className="p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-400" />
                      <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">Today</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <MetricCard icon={Users} label="Followers" value={formatNumber(profile.followers)} />
                      <MetricCard icon={Heart} label="Engagement" value={profile.engagement_rate ? `${profile.engagement_rate}%` : '\u2014'} />
                      <MetricCard icon={Eye} label="Posts" value={formatNumber(profile.posts)} />
                      <MetricCard icon={MessageCircle} label="Following" value={formatNumber(profile.following)} />
                    </div>
                    {profile.bio && (
                      <p className="text-xs text-text-muted italic border-l-2 border-white/10 pl-3">&ldquo;{profile.bio.substring(0, 120)}{profile.bio.length > 120 ? '...' : ''}&rdquo;</p>
                    )}
                  </div>

                  {/* AFTER (projected) */}
                  <div className="p-6 space-y-4 bg-emerald-500/[0.02]">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">In {timelineMonths} months</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <MetricCard
                        icon={Users}
                        label="Followers"
                        value={proj ? formatNumber(proj.followers_3mo) : '\u2014'}
                        change={followerGrowth ? `+${followerGrowth}%` : undefined}
                        positive
                      />
                      <MetricCard
                        icon={Heart}
                        label="Engagement"
                        value={proj ? `${proj.engagement_3mo}%` : '\u2014'}
                        change={profile.engagement_rate && proj ? `+${Math.round((proj.engagement_3mo - profile.engagement_rate) / profile.engagement_rate * 100)}%` : undefined}
                        positive
                      />
                      <MetricCard
                        icon={TrendingUp}
                        label="Posts / week"
                        value={proj ? `${proj.posts_per_week}` : '\u2014'}
                        subtitle="Consistent strategy"
                      />
                      <MetricCard
                        icon={Eye}
                        label="Reach increase"
                        value={followerGrowth ? `~${Math.round(followerGrowth * 1.5)}%` : '\u2014'}
                        subtitle="Estimated"
                        positive
                      />
                    </div>
                  </div>
                </div>

                {/* Competitor comparison (if available) */}
                {competitor && (
                  <div className="px-6 py-4 border-t border-nativz-border bg-white/[0.02]">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-purple-400" />
                      <h3 className="text-xs font-bold text-accent2-text uppercase tracking-wider">Competitor: @{competitor.handle}</h3>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="text-center">
                        <p className="text-sm font-bold text-white">{formatNumber(competitor.followers)}</p>
                        <p className="text-[10px] text-text-muted">Followers</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-white">{formatNumber(competitor.posts)}</p>
                        <p className="text-[10px] text-text-muted">Posts</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-white">{competitor.engagement_rate ? `${competitor.engagement_rate}%` : '\u2014'}</p>
                        <p className="text-[10px] text-text-muted">Eng. rate</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-emerald-400">
                          {competitor.followers && profile.followers
                            ? `${Math.round(((competitor.followers - profile.followers) / profile.followers) * 100)}% gap`
                            : '\u2014'
                          }
                        </p>
                        <p className="text-[10px] text-text-muted">To close</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Summary callout */}
          {audit.profiles.length > 0 && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.05] p-6 text-center space-y-3">
              <h2 className="text-xl font-bold text-white">What this means for {audit.business_name || 'your business'}</h2>
              <div className="grid grid-cols-3 gap-6 max-w-lg mx-auto">
                <div>
                  <p className="text-2xl font-bold text-emerald-400">
                    {(() => {
                      let totalGrowth = 0;
                      let count = 0;
                      for (const p of audit.profiles) {
                        const proj = audit.projections[p.platform];
                        if (proj && p.followers) {
                          totalGrowth += ((proj.followers_3mo - p.followers) / p.followers) * 100;
                          count++;
                        }
                      }
                      return count > 0 ? `+${Math.round(totalGrowth / count)}%` : '\u2014';
                    })()}
                  </p>
                  <p className="text-xs text-text-muted">Avg follower growth</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-400">
                    {(() => {
                      let total = 0;
                      for (const p of audit.profiles) {
                        const proj = audit.projections[p.platform];
                        if (proj) total += proj.posts_per_week;
                      }
                      return total > 0 ? `${total}/wk` : '\u2014';
                    })()}
                  </p>
                  <p className="text-xs text-text-muted">Content pieces</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-400">{timelineMonths}mo</p>
                  <p className="text-xs text-text-muted">To see results</p>
                </div>
              </div>
              <p className="text-sm text-text-muted max-w-md mx-auto">
                With a professional content strategy, consistent posting, and performance optimization across all platforms.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  change,
  positive,
  subtitle,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  change?: string;
  positive?: boolean;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border border-nativz-border bg-background p-3 space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon size={12} className="text-text-muted" />
        <span className="text-[10px] text-text-muted uppercase tracking-wider font-medium">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <p className="text-lg font-bold text-white">{value}</p>
        {change && (
          <span className={`text-[10px] font-bold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>{change}</span>
        )}
      </div>
      {subtitle && <p className="text-[9px] text-text-muted">{subtitle}</p>}
    </div>
  );
}
