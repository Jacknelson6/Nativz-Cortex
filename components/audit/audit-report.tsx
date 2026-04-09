'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Users,
  Eye,
  TrendingUp,
  BarChart3,
  RefreshCw,
  ExternalLink,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EncryptedText } from '@/components/ui/encrypted-text';
import { VideoGrid } from '@/components/research/video-grid';
import { toast } from 'sonner';
import type { PlatformReport, CompetitorProfile, AuditScorecard, ScorecardItem, ScoreStatus, WebsiteContext } from '@/lib/audit/types';
import type { TopicSearchVideoRow } from '@/lib/scrapers/types';

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

const STATUS_COLORS: Record<ScoreStatus, { dot: string; bg: string; text: string }> = {
  good: { dot: 'bg-emerald-400', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  warning: { dot: 'bg-amber-400', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  poor: { dot: 'bg-red-400', bg: 'bg-red-500/10', text: 'text-red-400' },
};

const STATUS_ICONS: Record<ScoreStatus, typeof CheckCircle> = {
  good: CheckCircle,
  warning: AlertTriangle,
  poor: XCircle,
};

const PROCESSING_STAGES = [
  'Crawling website',
  'Extracting brand identity',
  'Finding social media profiles',
  'Scraping TikTok posts',
  'Analyzing engagement metrics',
  'Discovering competitors',
  'Scraping competitor profiles',
  'Generating audit scorecard',
];

type AuditPlatformKey = 'tiktok' | 'instagram' | 'facebook' | 'youtube';

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
};

export function AuditReport({ audit: initialAudit }: { audit: AuditRecord }) {
  const router = useRouter();
  const [audit, setAudit] = useState(initialAudit);
  const [processing, setProcessing] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [socialInputs, setSocialInputs] = useState<Partial<Record<AuditPlatformKey, string>>>({});
  const [submittingSocials, setSubmittingSocials] = useState(false);

  // Auto-start processing for pending audits
  useEffect(() => {
    if (audit.status === 'pending') {
      void startProcessing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for completion + animate progress when processing
  useEffect(() => {
    if (audit.status !== 'processing') return;
    const startTime = Date.now();

    const progressInterval = setInterval(() => {
      const elapsedMs = Date.now() - startTime;
      setElapsed(Math.floor(elapsedMs / 1000));

      // Advance stage every ~15s, cap at second-to-last
      const stage = Math.min(PROCESSING_STAGES.length - 2, Math.floor(elapsedMs / 15000));
      setStageIndex(stage);

      // Progress: advance smoothly to 90%, never pass it until done
      const pct = Math.min(90, (elapsedMs / 180000) * 90);
      setProgress(pct);
    }, 500);

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/audit/${audit.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.audit.status !== 'processing') {
            setAudit(data.audit);
            setProcessing(false);
            setProgress(100);
            setStageIndex(PROCESSING_STAGES.length - 1);
          }
        }
      } catch { /* ignore */ }
    }, 3000);

    return () => {
      clearInterval(progressInterval);
      clearInterval(pollInterval);
    };
  }, [audit.id, audit.status]);

  async function startProcessing() {
    setProcessing(true);
    setProgress(0);
    setStageIndex(0);
    setElapsed(0);
    setAudit(prev => ({ ...prev, status: 'processing' }));
    try {
      const res = await fetch(`/api/audit/${audit.id}/process`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? 'Processing failed');
      }
    } catch {
      toast.error('Failed to start processing');
      setProcessing(false);
    }
  }

  async function handleSubmitSocials() {
    const filled = Object.fromEntries(
      Object.entries(socialInputs).filter(([, v]) => v?.trim())
    );
    if (Object.keys(filled).length === 0) {
      toast.error('Enter at least one social profile URL');
      return;
    }
    setSubmittingSocials(true);
    try {
      const res = await fetch(`/api/audit/${audit.id}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ social_urls: filled }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to submit');
        return;
      }
      // Reset to pending → will auto-start processing
      setAudit(prev => ({ ...prev, status: 'pending' }));
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSubmittingSocials(false);
    }
  }

  function formatElapsed(s: number): string {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  const platforms = audit.prospect_data?.platforms ?? [];
  const websiteContext = audit.prospect_data?.websiteContext ?? null;
  const competitors = audit.competitors_data ?? [];
  const scorecard = audit.scorecard;
  const videos = (audit.videos_data ?? []) as TopicSearchVideoRow[];

  // Needs social input — website scrape didn't find social profiles
  if (audit.status === 'needs_social_input') {
    const detectedContext = audit.prospect_data?.websiteContext;
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
        <div className="w-full max-w-md space-y-5">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-text-primary">
              No social profiles found
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              We scraped {audit.website_url?.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              {detectedContext ? ` (${detectedContext.industry})` : ''} but couldn&apos;t find any social media links. Add them below to continue the audit.
            </p>
          </div>

          <div className="rounded-xl border border-nativz-border bg-surface p-4 space-y-3">
            {(['tiktok', 'instagram', 'facebook', 'youtube'] as AuditPlatformKey[]).map(platform => (
              <div key={platform} className="flex items-center gap-3">
                <span className="text-sm text-text-muted w-20 shrink-0">{PLATFORM_LABELS[platform]}</span>
                <input
                  type="text"
                  value={socialInputs[platform] ?? ''}
                  onChange={(e) => setSocialInputs(prev => ({ ...prev, [platform]: e.target.value }))}
                  placeholder={`${platform}.com/@username`}
                  className="flex-1 rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/40"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSubmitSocials();
                  }}
                />
              </div>
            ))}

            <Button
              onClick={handleSubmitSocials}
              disabled={submittingSocials || Object.values(socialInputs).every(v => !v?.trim())}
              className="w-full mt-2"
            >
              {submittingSocials ? <Loader2 size={16} className="animate-spin" /> : 'Continue audit'}
            </Button>
          </div>

          <div className="text-center">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/audit')}>
              <ArrowLeft size={14} /> Back to audits
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Processing state — matches research processing page
  if (audit.status === 'processing' || audit.status === 'pending') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 animate-fade-slide-in">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h2 className="text-xl font-semibold text-text-primary">
              Auditing {audit.website_url ? `"${audit.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}"` : 'prospect'}
            </h2>
          </div>

          {/* Encrypted text stage label */}
          <div className="text-center mb-4">
            <EncryptedText
              key={`stage-${stageIndex}`}
              text={PROCESSING_STAGES[stageIndex]}
              revealDelayMs={40}
              className="text-sm text-text-muted"
            />
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, var(--accent), var(--accent2))',
              }}
            />
          </div>

          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-xs text-text-muted tabular-nums">{formatElapsed(elapsed)} elapsed</span>
            <span className="text-xs text-text-muted tabular-nums">{Math.round(progress)}%</span>
          </div>

          <div className="mt-6 flex items-center justify-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/audit')}>
              <ArrowLeft size={12} /> Go back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (audit.status === 'failed') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
        <div className="text-center max-w-md">
          <XCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-text-primary">Audit failed</h2>
          <p className="mt-2 text-sm text-text-muted">{audit.error_message ?? 'An unknown error occurred.'}</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/audit')}>
              <ArrowLeft size={14} /> Back
            </Button>
            <Button size="sm" onClick={startProcessing}>
              <RefreshCw size={14} /> Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Completed — show report
  const primaryPlatform = platforms[0];

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/audit')}>
          <ArrowLeft size={14} /> Back
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-text-primary">
            Prospect audit{websiteContext ? `: ${websiteContext.title}` : ''}
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            {audit.website_url && <span>{audit.website_url.replace(/^https?:\/\//, '')} · </span>}
            {platforms.length} platform{platforms.length !== 1 ? 's' : ''} analyzed · {new Date(audit.created_at).toLocaleDateString()}
          </p>
        </div>
        {scorecard && (
          <div className="flex items-center gap-2">
            <div className={`text-3xl font-bold ${
              scorecard.overallScore >= 70 ? 'text-emerald-400' :
              scorecard.overallScore >= 40 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {scorecard.overallScore}
            </div>
            <span className="text-xs text-text-muted">/100</span>
          </div>
        )}
      </div>

      {/* Website context card */}
      {websiteContext && (
        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-2">
            <Globe size={16} className="text-text-muted" />
            <h3 className="text-sm font-semibold text-text-primary">Brand overview</h3>
          </div>
          <p className="text-sm text-text-secondary">{websiteContext.description}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs bg-accent-surface/20 text-accent-text px-2.5 py-1 rounded-full">{websiteContext.industry}</span>
            {websiteContext.keywords.slice(0, 5).map(kw => (
              <span key={kw} className="text-xs bg-surface-hover text-text-muted px-2.5 py-1 rounded-full">{kw}</span>
            ))}
          </div>
        </div>
      )}

      {/* Platform reports — one card per platform */}
      {platforms.map((platform) => (
        <div key={platform.platform} className="rounded-xl border border-nativz-border bg-surface p-5">
          <div className="flex items-start gap-4">
            {platform.profile.avatarUrl && (
              <img
                src={platform.profile.avatarUrl}
                alt={platform.profile.displayName}
                className="h-14 w-14 rounded-full object-cover"
              />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-text-primary">{platform.profile.displayName}</h2>
                <span className="text-xs bg-pink-500/10 text-pink-400 px-2 py-0.5 rounded-full capitalize">{platform.platform}</span>
                {platform.profile.verified && (
                  <CheckCircle size={16} className="text-accent-text" />
                )}
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
                <p className="mt-2 text-sm text-text-secondary">{platform.profile.bio}</p>
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
      ))}

      {/* Summary */}
      {scorecard?.summary && (
        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-2">Executive summary</h3>
          <p className="text-sm text-text-secondary leading-relaxed">{scorecard.summary}</p>
        </div>
      )}

      {/* Scorecard */}
      {scorecard && scorecard.items.length > 0 && (
        <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
          <div className="px-5 py-4 border-b border-nativz-border">
            <h3 className="text-sm font-semibold text-text-primary">Audit scorecard</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Green = doing well · Yellow = could improve · Red = needs attention
            </p>
          </div>
          <div className="divide-y divide-nativz-border">
            {scorecard.items.map((item, i) => (
              <ScorecardRow key={i} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Competitors */}
      {competitors.length > 0 && (
        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Competitors</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {competitors.map((comp) => (
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
      )}

      {/* Source browser — VideoGrid from research */}
      {videos.length > 0 && (
        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Source content</h3>
          <VideoGrid
            videos={videos}
            searchId={audit.id}
            defaultClientId={null}
            enableInlineVideoAnalysis={false}
          />
        </div>
      )}
    </div>
  );
}

function ScorecardRow({ item }: { item: ScorecardItem }) {
  const prospectStyle = STATUS_COLORS[item.prospectStatus];
  const ProspectIcon = STATUS_ICONS[item.prospectStatus];

  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 h-6 w-6 rounded-full ${prospectStyle.bg} flex items-center justify-center shrink-0`}>
          <ProspectIcon size={14} className={prospectStyle.text} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-text-primary">{item.label}</h4>
          <p className="text-xs text-text-secondary mt-0.5">{item.prospectValue}</p>
          <p className="text-xs text-text-muted mt-1">{item.description}</p>
          {item.competitors.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {item.competitors.map((comp) => {
                const compStyle = STATUS_COLORS[comp.status];
                return (
                  <span
                    key={comp.username}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${compStyle.bg} ${compStyle.text}`}
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
      </div>
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

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
