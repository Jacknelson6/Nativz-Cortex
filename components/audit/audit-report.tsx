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
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area, ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { EncryptedText } from '@/components/ui/encrypted-text';
import { VideoGrid } from '@/components/research/video-grid';
import { toast } from 'sonner';
import { AuditExportPdfButton } from '@/components/audit/audit-export-pdf-button';
import { AuditShareButton } from '@/components/audit/audit-share-button';
import type { PlatformReport, CompetitorProfile, AuditScorecard, ScorecardItem, ScoreStatus, WebsiteContext, ProspectVideo } from '@/lib/audit/types';
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

const PROCESSING_STAGES = [
  'Crawling website',
  'Extracting brand identity',
  'Finding social media profiles',
  'Scraping TikTok posts',
  'Scraping Instagram reels',
  'Analyzing engagement metrics',
  'Discovering competitors',
  'Scraping competitor profiles',
  'Generating audit scorecard',
];

type AuditPlatformKey = 'tiktok' | 'instagram' | 'facebook' | 'youtube';

export function AuditReport({ audit: initialAudit }: { audit: AuditRecord }) {
  const router = useRouter();
  const [audit, setAudit] = useState(initialAudit);
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [activePlatformTab, setActivePlatformTab] = useState<string | null>(null);
  const [socialInputs, setSocialInputs] = useState<Partial<Record<AuditPlatformKey, string>>>({});
  const [submittingSocials, setSubmittingSocials] = useState(false);
  const [completedAudit, setCompletedAudit] = useState<AuditRecord | null>(null);
  const [finishingAnimation, setFinishingAnimation] = useState(false);
  const [detectedPlatforms, setDetectedPlatforms] = useState<{ platform: string; url: string; username: string }[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [websiteInfo, setWebsiteInfo] = useState<{ title: string; industry: string } | null>(null);

  // Auto-detect socials for pending audits (don't start processing yet)
  useEffect(() => {
    if (audit.status === 'pending') void detectSocials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smooth progress: accelerates over time (eased curve), caps at 92% until done
  useEffect(() => {
    if (audit.status !== 'processing') return;
    const startTime = Date.now();
    let currentProgress = 0;
    let currentStage = 0;

    const progressInterval = setInterval(() => {
      const ms = Date.now() - startTime;
      setElapsed(Math.floor(ms / 1000));

      // Eased progress: fast at start, slows as it approaches 92%
      // Uses an ease-out curve so it always feels like it's moving
      const t = Math.min(1, ms / 120000); // normalize to 0-1 over 2 min
      const eased = 1 - Math.pow(1 - t, 2.5); // ease-out curve
      const targetProgress = eased * 92;

      // Smooth toward target (never jump)
      currentProgress += (targetProgress - currentProgress) * 0.08;
      setProgress(Math.min(92, currentProgress));

      // Advance stages smoothly based on progress
      const newStage = Math.min(
        PROCESSING_STAGES.length - 2,
        Math.floor((currentProgress / 92) * (PROCESSING_STAGES.length - 1))
      );
      if (newStage !== currentStage) {
        currentStage = newStage;
        setStageIndex(newStage);
      }
    }, 50); // 50ms for buttery smooth animation

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/audit/${audit.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.audit.status !== 'processing') {
            // Don't show report immediately — animate to 100% first
            clearInterval(progressInterval);
            clearInterval(pollInterval);
            setCompletedAudit(data.audit);
            setFinishingAnimation(true);
            setStageIndex(PROCESSING_STAGES.length - 1);

            // Animate from current to 100% over 2s
            const startPct = currentProgress;
            const animStart = Date.now();
            const finishInterval = setInterval(() => {
              const elapsed = Date.now() - animStart;
              const frac = Math.min(1, elapsed / 2000);
              const easedFrac = 1 - Math.pow(1 - frac, 3);
              setProgress(startPct + (100 - startPct) * easedFrac);
              if (frac >= 1) {
                clearInterval(finishInterval);
                // Show report after a brief pause at 100%
                setTimeout(() => {
                  setAudit(data.audit);
                  setFinishingAnimation(false);
                }, 400);
              }
            }, 16);
          }
        }
      } catch { /* ignore */ }
    }, 2500);

    return () => { clearInterval(progressInterval); clearInterval(pollInterval); };
  }, [audit.id, audit.status]);

  // Set first platform tab when data loads
  useEffect(() => {
    const platforms = audit.prospect_data?.platforms ?? [];
    if (platforms.length > 0 && !activePlatformTab) {
      setActivePlatformTab(platforms[0].platform);
    }
  }, [audit.prospect_data, activePlatformTab]);

  async function detectSocials() {
    setDetecting(true);
    try {
      const res = await fetch(`/api/audit/${audit.id}/detect-socials`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setDetectedPlatforms(data.detectedPlatforms ?? []);
        setWebsiteInfo(data.websiteContext ? { title: data.websiteContext.title, industry: data.websiteContext.industry } : null);
        // Pre-fill social inputs with detected URLs
        const prefilled: Partial<Record<AuditPlatformKey, string>> = {};
        for (const link of data.detectedPlatforms ?? []) {
          if (['tiktok', 'instagram', 'facebook', 'youtube'].includes(link.platform)) {
            prefilled[link.platform as AuditPlatformKey] = link.url;
          }
        }
        setSocialInputs(prefilled);
        setAudit(prev => ({ ...prev, status: 'confirming_platforms' }));
      } else {
        // If detect fails, go straight to processing
        void startProcessing();
      }
    } catch {
      void startProcessing();
    } finally {
      setDetecting(false);
    }
  }

  async function startProcessing() {
    // Save any manual social URLs before processing
    const filled = Object.fromEntries(Object.entries(socialInputs).filter(([, v]) => v?.trim()));
    if (Object.keys(filled).length > 0) {
      await fetch(`/api/audit/${audit.id}/resume`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ social_urls: filled }),
      });
    }
    setProgress(0); setStageIndex(0); setElapsed(0);
    setAudit(prev => ({ ...prev, status: 'processing' }));
    try {
      const res = await fetch(`/api/audit/${audit.id}/process`, { method: 'POST' });
      if (!res.ok) { const data = await res.json(); toast.error(data.error ?? 'Processing failed'); }
    } catch { toast.error('Failed to start processing'); }
  }

  async function handleSubmitSocials() {
    const filled = Object.fromEntries(Object.entries(socialInputs).filter(([, v]) => v?.trim()));
    if (Object.keys(filled).length === 0) { toast.error('Enter at least one social profile URL'); return; }
    setSubmittingSocials(true);
    try {
      const res = await fetch(`/api/audit/${audit.id}/resume`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ social_urls: filled }),
      });
      if (!res.ok) { const data = await res.json(); toast.error(data.error ?? 'Failed'); return; }
      setAudit(prev => ({ ...prev, status: 'pending' }));
    } catch { toast.error('Something went wrong'); }
    finally { setSubmittingSocials(false); }
  }

  function formatElapsed(s: number): string {
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  const platforms = audit.prospect_data?.platforms ?? [];
  const websiteContext = audit.prospect_data?.websiteContext ?? null;
  const competitors = audit.competitors_data ?? [];
  const scorecard = audit.scorecard;
  const videos = (audit.videos_data ?? []) as TopicSearchVideoRow[];
  const activePlatform = platforms.find(p => p.platform === activePlatformTab) ?? platforms[0];

  // ── Detecting socials (initial website scrape) ─────────────────────────
  if (audit.status === 'pending' && detecting) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 animate-fade-slide-in">
        <div className="w-full max-w-md text-center">
          <Loader2 size={32} className="animate-spin text-accent-text mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-text-primary">Scanning website</h2>
          <p className="mt-1 text-sm text-text-muted">Looking for social media profiles...</p>
        </div>
      </div>
    );
  }

  // ── Confirming platforms ───────────────────────────────────────────────
  if (audit.status === 'confirming_platforms' || (audit.status === 'pending' && detectedPlatforms.length >= 0 && !detecting)) {
    const hasPlatforms = Object.values(socialInputs).some(v => v?.trim());
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
        <div className="w-full max-w-lg space-y-5">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-text-primary">Confirm social platforms</h2>
            <p className="mt-1 text-sm text-text-muted">
              {websiteInfo ? `${websiteInfo.title} — ${websiteInfo.industry}` : audit.website_url?.replace(/^https?:\/\//, '')}
            </p>
            {detectedPlatforms.length > 0 ? (
              <p className="mt-2 text-xs text-emerald-400">
                Found {detectedPlatforms.length} social profile{detectedPlatforms.length !== 1 ? 's' : ''} on the website
              </p>
            ) : (
              <p className="mt-2 text-xs text-amber-400">
                No social profiles detected — add them manually below
              </p>
            )}
          </div>

          <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
            {(['tiktok', 'instagram', 'facebook', 'youtube'] as AuditPlatformKey[]).map(platform => {
              const detected = detectedPlatforms.find(d => d.platform === platform);
              return (
                <div key={platform} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-24 shrink-0">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[platform] }} />
                    <span className="text-sm text-text-primary font-medium">{PLATFORM_LABELS[platform]}</span>
                  </div>
                  <input
                    type="text"
                    value={socialInputs[platform] ?? ''}
                    onChange={(e) => setSocialInputs(prev => ({ ...prev, [platform]: e.target.value }))}
                    placeholder={detected ? '' : `${platform}.com/@username`}
                    className="flex-1 rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/40"
                  />
                  {detected && (
                    <span className="shrink-0 text-xs text-emerald-400">Auto-detected</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/audit')}>
              <ArrowLeft size={14} /> Back
            </Button>
            <Button onClick={() => void startProcessing()} disabled={!hasPlatforms}>
              {hasPlatforms ? 'Start audit' : 'Add at least one platform'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Processing state ──────────────────────────────────────────────────
  if (audit.status === 'processing') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 animate-fade-slide-in">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h2 className="text-xl font-semibold text-text-primary">
              {(() => {
                if (!audit.website_url) return 'Analyzing prospect socials';
                // Derive a human brand label from the URL: toastique.com → Toastique, www.foo-bar.com → Foo-bar
                let brand: string;
                try {
                  const u = new URL(audit.website_url.startsWith('http') ? audit.website_url : `https://${audit.website_url}`);
                  const firstLabel = u.hostname.replace(/^www\./, '').split('.')[0];
                  brand = firstLabel.charAt(0).toUpperCase() + firstLabel.slice(1);
                } catch {
                  brand = 'this brand';
                }
                // Possessive: Toastique → Toastique's, James → James'
                const possessive = brand.endsWith('s') ? `${brand}'` : `${brand}'s`;
                return `Analyzing ${possessive} socials`;
              })()}
            </h2>
          </div>
          <div className="text-center mb-4">
            <EncryptedText key={`stage-${stageIndex}`} text={PROCESSING_STAGES[stageIndex]} revealDelayMs={40} className="text-sm text-text-muted" />
          </div>
          <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
            <div className="h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent2))' }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-xs text-text-muted tabular-nums">{formatElapsed(elapsed)} elapsed</span>
            <span className="text-xs text-text-muted tabular-nums">{Math.round(progress)}%</span>
          </div>
          <div className="mt-6 flex items-center justify-center">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/audit')}><ArrowLeft size={12} /> Go back</Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Needs social input ────────────────────────────────────────────────
  if (audit.status === 'needs_social_input') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
        <div className="w-full max-w-md space-y-5">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-text-primary">No social profiles found</h2>
            <p className="mt-2 text-sm text-text-muted">
              We scraped {audit.website_url?.replace(/^https?:\/\//, '').replace(/\/$/, '')} but couldn&apos;t find social media links. Add them below.
            </p>
          </div>
          <div className="rounded-xl border border-nativz-border bg-surface p-4 space-y-3">
            {(['tiktok', 'instagram', 'facebook', 'youtube'] as AuditPlatformKey[]).map(platform => (
              <div key={platform} className="flex items-center gap-3">
                <span className="text-sm text-text-muted w-20 shrink-0">{PLATFORM_LABELS[platform]}</span>
                <input type="text" value={socialInputs[platform] ?? ''} onChange={(e) => setSocialInputs(prev => ({ ...prev, [platform]: e.target.value }))}
                  placeholder={`${platform}.com/@username`} className="flex-1 rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/40"
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmitSocials(); }} />
              </div>
            ))}
            <Button onClick={handleSubmitSocials} disabled={submittingSocials || Object.values(socialInputs).every(v => !v?.trim())} className="w-full mt-2">
              {submittingSocials ? <Loader2 size={16} className="animate-spin" /> : 'Continue audit'}
            </Button>
          </div>
          <div className="text-center"><Button variant="ghost" size="sm" onClick={() => router.push('/admin/audit')}><ArrowLeft size={14} /> Back</Button></div>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (audit.status === 'failed') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
        <div className="text-center max-w-md">
          <XCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-text-primary">Audit failed</h2>
          <p className="mt-2 text-sm text-text-muted">{audit.error_message ?? 'An unknown error occurred.'}</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/audit')}><ArrowLeft size={14} /> Back</Button>
            <Button size="sm" onClick={startProcessing}><RefreshCw size={14} /> Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Completed report ──────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/audit')}><ArrowLeft size={14} /> Back</Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-text-primary">
            Audit{websiteContext ? `: ${websiteContext.title}` : ''}
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            {audit.website_url && <span>{audit.website_url.replace(/^https?:\/\//, '')} · </span>}
            {platforms.length} platform{platforms.length !== 1 ? 's' : ''} · {new Date(audit.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AuditExportPdfButton
            websiteContext={websiteContext}
            platforms={platforms}
            competitors={competitors}
            scorecard={scorecard}
          />
          <AuditShareButton auditId={audit.id} />
          {scorecard && (
            <div className="flex items-center gap-1 ml-2">
              <div className={`text-3xl font-bold ${scorecard.overallScore >= 70 ? 'text-emerald-400' : scorecard.overallScore >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                {scorecard.overallScore}
              </div>
              <span className="text-xs text-text-muted">/100</span>
            </div>
          )}
        </div>
      </div>

      {/* Website context */}
      {websiteContext && (
        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-2"><Globe size={16} className="text-text-muted" /><h3 className="text-sm font-semibold text-text-primary">Brand overview</h3></div>
          <p className="text-sm text-text-secondary">{websiteContext.description}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs bg-accent-surface/20 text-accent-text px-2.5 py-1 rounded-full">{websiteContext.industry}</span>
            {websiteContext.keywords.slice(0, 5).map(kw => (
              <span key={kw} className="text-xs bg-surface-hover text-text-muted px-2.5 py-1 rounded-full">{kw}</span>
            ))}
          </div>
        </div>
      )}

      {/* Scorecard with dots */}
      {scorecard && scorecard.items.length > 0 && (
        <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
          <div className="px-5 py-4 border-b border-nativz-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Audit scorecard</h3>
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

      {/* Summary */}
      {scorecard?.summary && (
        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-2">Executive summary</h3>
          <p className="text-sm text-text-secondary leading-relaxed">{scorecard.summary}</p>
        </div>
      )}

      {/* Platform tabs + data */}
      {platforms.length > 0 && (
        <div className="space-y-4">
          {/* Tab switcher */}
          {platforms.length > 1 && (
            <div className="flex items-center rounded-lg border border-nativz-border bg-surface p-0.5">
              {platforms.map(p => (
                <button key={p.platform} onClick={() => setActivePlatformTab(p.platform)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activePlatformTab === p.platform ? 'bg-accent-surface text-accent-text shadow-sm' : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
                  }`}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[p.platform] ?? 'var(--accent)' }} />
                  {PLATFORM_LABELS[p.platform] ?? p.platform}
                </button>
              ))}
            </div>
          )}

          {/* Active platform detail */}
          {activePlatform && <PlatformDetail platform={activePlatform} auditId={audit.id} />}
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
                    {comp.avatarUrl && <img src={comp.avatarUrl} alt={comp.displayName} className="h-10 w-10 rounded-full object-cover" />}
                    <div>
                      <p className="text-sm font-medium text-text-primary">{comp.displayName}</p>
                      <a href={comp.profileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-text hover:underline flex items-center gap-1">
                        @{comp.username} <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-text-muted">Followers</span><p className="font-medium text-text-primary">{formatNumber(comp.followers)}</p></div>
                    <div><span className="text-text-muted">Engagement</span><p className="font-medium text-text-primary">{(comp.engagementRate * 100).toFixed(2)}%</p></div>
                    <div><span className="text-text-muted">Avg views</span><p className="font-medium text-text-primary">{formatNumber(comp.avgViews)}</p></div>
                    <div><span className="text-text-muted">Frequency</span><p className="font-medium text-text-primary">{comp.postingFrequency}</p></div>
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
                  <BarChart data={[
                    ...(activePlatform ? [{ name: `@${activePlatform.profile.username} (You)`, views: activePlatform.avgViews, fill: 'var(--accent)' }] : []),
                    ...competitors.map((c, i) => ({ name: `@${c.username}`, views: c.avgViews, fill: ['#A78BFA', '#34D399', '#F97316', '#EC4899', '#14B8A6'][i % 5] })),
                  ]} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--nativz-border)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => formatNumber(v)} />
                    <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={120} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--nativz-border)', borderRadius: '8px', fontSize: '12px' }} formatter={(value: number | undefined) => [formatNumber(value ?? 0), 'Avg views']} />
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
                  <BarChart data={[
                    ...(activePlatform ? [{ name: `@${activePlatform.profile.username} (You)`, er: parseFloat((activePlatform.engagementRate * 100).toFixed(2)) }] : []),
                    ...competitors.map(c => ({ name: `@${c.username}`, er: parseFloat((c.engagementRate * 100).toFixed(2)) })),
                  ]} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--nativz-border)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                    <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={120} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--nativz-border)', borderRadius: '8px', fontSize: '12px' }} formatter={(value: number | undefined) => [`${value ?? 0}%`, 'ER']} />
                    <Bar dataKey="er" fill="var(--accent2)" radius={[0, 4, 4, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Source browser */}
      {videos.length > 0 && (
        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Source content</h3>
          <VideoGrid videos={videos} searchId={audit.id} defaultClientId={null} enableInlineVideoAnalysis={false} />
        </div>
      )}
    </div>
  );
}

// ── Platform detail with Recharts ───────────────────────────────────────

function PlatformDetail({ platform, auditId }: { platform: PlatformReport; auditId: string }) {
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
              <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ backgroundColor: `${color}20`, color }}>{platform.platform}</span>
              {platform.profile.verified && <CheckCircle size={16} className="text-accent-text" />}
            </div>
            <a href={platform.profile.profileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-accent-text hover:underline flex items-center gap-1">
              @{platform.profile.username} <ExternalLink size={12} />
            </a>
            {platform.profile.bio && <p className="mt-2 text-sm text-text-secondary line-clamp-2">{platform.profile.bio}</p>}
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
                  <linearGradient id={`erGrad-${platform.platform}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--nativz-border)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--nativz-border)', borderRadius: '8px', fontSize: '12px' }} formatter={(value: number | undefined) => [`${value ?? 0}%`, 'ER']} />
                <Area type="monotone" dataKey="er" stroke={color} fillOpacity={1} fill={`url(#erGrad-${platform.platform})`} strokeWidth={2} />
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
                <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--nativz-border)', borderRadius: '8px', fontSize: '12px' }} formatter={(value: number | undefined) => [formatNumber(value ?? 0), 'Views']} />
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
              <a key={post.id || i} href={post.url} target="_blank" rel="noopener noreferrer" className="group block rounded-lg border border-nativz-border bg-background overflow-hidden hover:border-accent/40 transition-colors">
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
                  <p className="text-[10px] text-text-muted">{formatNumber(post.likes)} likes · {formatNumber(post.comments)} comments</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Scorecard card ──────────────────────────────────────────────────────

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
              <span key={comp.username} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${compStyle.bg} ${compStyle.text}`} title={comp.value}>
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

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
