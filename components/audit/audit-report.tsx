'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
  Users,
  Eye,
  TrendingUp,
  BarChart3,
  RefreshCw,
  ExternalLink,
  Globe,
  Heart,
  MessageCircle,
  Share2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area,
} from 'recharts';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { EncryptedText } from '@/components/ui/encrypted-text';
import { toast } from 'sonner';
import { AuditExportPdfButton } from '@/components/audit/audit-export-pdf-button';
import { AuditShareButton } from '@/components/audit/audit-share-button';
import { LandscapeView } from './landscape/landscape-view';
import { TikTokMark } from '@/components/integrations/tiktok-mark';
import { InstagramMark } from '@/components/integrations/instagram-mark';
import { FacebookMark } from '@/components/integrations/facebook-mark';
import { YouTubeMark } from '@/components/integrations/youtube-mark';
import type { PlatformReport, CompetitorProfile, AuditScorecard, ScorecardItem, ScoreStatus, WebsiteContext, FailedPlatform } from '@/lib/audit/types';
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
    failedPlatforms?: FailedPlatform[];
  } | null;
  competitors_data: CompetitorProfile[] | null;
  scorecard: AuditScorecard | null;
  videos_data: TopicSearchVideoRow[] | null;
  analysis_data: { social_goals?: string[] } | null;
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

/**
 * Standardized platform icon — renders the brand mark directly on transparent
 * background with no tile wrappers. YouTube keeps its full red mark.
 * Instagram uses the gradient 'full' variant so it shows the brand gradient
 * without needing a coloured tile behind it.
 */
function AuditPlatformIcon({ platform, size = 'md' }: { platform: AuditPlatformKey; size?: 'sm' | 'md' }) {
  const iconSize = size === 'sm' ? 24 : 28;

  if (platform === 'youtube') {
    return (
      <span className="inline-flex shrink-0 items-center justify-center" aria-hidden>
        <YouTubeMark variant="full" size={iconSize} />
      </span>
    );
  }
  if (platform === 'tiktok') {
    return (
      <span className="inline-flex shrink-0 items-center justify-center" aria-hidden>
        <TikTokMark size={iconSize} />
      </span>
    );
  }
  if (platform === 'instagram') {
    return (
      <span className="inline-flex shrink-0 items-center justify-center" aria-hidden>
        <InstagramMark variant="full" size={iconSize} />
      </span>
    );
  }
  // facebook
  return (
    <span className="inline-flex shrink-0 items-center justify-center" aria-hidden>
      <FacebookMark variant="full" size={iconSize} />
    </span>
  );
}

const PROCESSING_STAGES = [
  'Crawling website',
  'Extracting brand identity',
  'Finding social media profiles',
  'Scraping TikTok posts',
  'Scraping Instagram reels',
  'Analyzing engagement metrics',
  'Discovering competitors',
  'Scraping competitor profiles',
  'Generating analysis scorecard',
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
  const [competitorUrls, setCompetitorUrls] = useState<string[]>(['', '', '']);
  const [competitorSuggestionsLoading, setCompetitorSuggestionsLoading] = useState(false);
  const [competitorFaviconErrors, setCompetitorFaviconErrors] = useState<boolean[]>([false, false, false]);
  const [submittingSocials, setSubmittingSocials] = useState(false);
  const [detectedPlatforms, setDetectedPlatforms] = useState<{ platform: string; url: string; username: string }[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [websiteInfo, setWebsiteInfo] = useState<{ title: string; industry: string } | null>(null);
  const SOCIAL_GOAL_OPTIONS = [
    'Build brand awareness',
    'Go viral and maximize engagement',
    'Drive foot traffic and local visits',
    'Turn followers into paying customers',
    'Launch new products or seasonal content',
    'Grow a loyal community',
  ] as const;
  const [socialGoals, setSocialGoals] = useState<string[]>(['Build brand awareness']);
  const [brandDescription, setBrandDescription] = useState<string>('');

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

      // Eased progress: fast at start, slows as it approaches 92%.
      // Normalise over ~4min so the bar keeps moving for the full duration
      // of a typical audit (previously capped at 120s, which meant the bar
      // sat frozen at 92% for the last 2-3 minutes of long audits).
      const t = Math.min(1, ms / 240000); // normalize to 0-1 over 4 min
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

    // Poll faster (1.5s) so completion is caught quickly and the report
    // opens immediately. Also log failures instead of swallowing them —
    // silent catches were how stuck-processing bugs went unnoticed before.
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/analyze-social/${audit.id}`, { cache: 'no-store' });
        if (!res.ok) {
          console.warn(`[audit] poll → HTTP ${res.status}`);
          return;
        }
        const data = await res.json();
        const nextStatus = data?.audit?.status;
        if (nextStatus && nextStatus !== 'processing') {
          console.log(`[audit] poll → status changed to "${nextStatus}" — finishing`);
          // Don't show report immediately — animate to 100% first, snappy
          clearInterval(progressInterval);
          clearInterval(pollInterval);
          setStageIndex(PROCESSING_STAGES.length - 1);

          // Animate from current to 100% quickly (~900ms), then flip to
          // the report after a short hold at 100%.
          const startPct = currentProgress;
          const animStart = Date.now();
          const finishInterval = setInterval(() => {
            const elapsedAnim = Date.now() - animStart;
            const frac = Math.min(1, elapsedAnim / 900);
            const easedFrac = 1 - Math.pow(1 - frac, 3);
            setProgress(startPct + (100 - startPct) * easedFrac);
            if (frac >= 1) {
              clearInterval(finishInterval);
              setTimeout(() => {
                setAudit(data.audit);
              }, 150);
            }
          }, 16);
        }
      } catch (err) {
        console.warn('[audit] poll failed:', err);
      }
    }, 1500);

    // Client-side safety net: if we've been polling for >7 minutes and
    // the backend is still claiming `processing`, the GET endpoint's
    // stale-detector should have flipped it by now. If it hasn't, show
    // a failure state so the user isn't stranded on a spinner.
    const clientTimeoutMs = 7 * 60 * 1000;
    const clientTimeoutId = setTimeout(() => {
      clearInterval(progressInterval);
      clearInterval(pollInterval);
      console.warn('[audit] client-side timeout — marking as failed');
      toast.error('Audit is taking longer than expected. Try again.');
      setAudit(prev => ({
        ...prev,
        status: 'failed',
        error_message:
          'Audit took longer than the platform time limit. This usually means a scrape got stuck. Retry to try again.',
      }));
    }, clientTimeoutMs);

    return () => {
      clearInterval(progressInterval);
      clearInterval(pollInterval);
      clearTimeout(clientTimeoutId);
    };
  }, [audit.id, audit.status]);

  // Set first platform tab when data loads
  useEffect(() => {
    const platforms = audit.prospect_data?.platforms ?? [];
    if (platforms.length > 0 && !activePlatformTab) {
      setActivePlatformTab(platforms[0].platform);
    }
  }, [audit.prospect_data, activePlatformTab]);

  function normaliseHttps(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) return '';
    return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  }

  /** Strip `https://` + leading `www.` for display. Scrapers normalise back on submit. */
  function prettyUrl(url: string): string {
    return url.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  }

  function faviconDomain(url: string): string | null {
    try {
      return new URL(normaliseHttps(url)).hostname.replace(/^www\./i, '');
    } catch {
      return null;
    }
  }

  async function detectSocials() {
    setDetecting(true);
    try {
      const res = await fetch(`/api/analyze-social/${audit.id}/detect-socials`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setDetectedPlatforms(data.detectedPlatforms ?? []);
        setWebsiteInfo(data.websiteContext ? { title: data.websiteContext.title, industry: data.websiteContext.industry } : null);
        if (data.websiteContext?.description) {
          setBrandDescription(data.websiteContext.description);
        }
        // Pre-fill social inputs with prettified URLs (scrapers re-add https:// on submit)
        const preset: Partial<Record<AuditPlatformKey, string>> = {};
        for (const d of data.detectedPlatforms ?? []) {
          if (d.url && (['tiktok', 'instagram', 'facebook', 'youtube'] as const).includes(d.platform as AuditPlatformKey)) {
            preset[d.platform as AuditPlatformKey] = prettyUrl(d.url);
          }
        }
        setSocialInputs(preset);
        setAudit(prev => ({ ...prev, status: 'confirming_platforms' }));

        // Fire competitor suggestions + social goals in parallel (non-blocking)
        setCompetitorSuggestionsLoading(true);
        fetch(`/api/analyze-social/${audit.id}/suggest-competitors`, { method: 'POST' })
          .then(async (r) => {
            if (!r.ok) return;
            const d = await r.json();
            const candidates: { website: string }[] = d.candidates ?? [];
            const urls = candidates.map((c) => prettyUrl(c.website));
            // Pad to length 3
            while (urls.length < 3) urls.push('');
            setCompetitorUrls(urls);
          })
          .catch(() => { /* silently ignore — inputs stay empty */ })
          .finally(() => setCompetitorSuggestionsLoading(false));

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
    const cleanedCompetitors = competitorUrls.map((u) => u.trim()).filter(Boolean);
    if (Object.keys(filled).length > 0 || cleanedCompetitors.length > 0) {
      await fetch(`/api/analyze-social/${audit.id}/resume`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ social_urls: filled, competitor_urls: cleanedCompetitors, social_goals: socialGoals }),
      });
    }
    setProgress(0); setStageIndex(0); setElapsed(0);
    setAudit(prev => ({ ...prev, status: 'processing' }));
    try {
      const res = await fetch(`/api/analyze-social/${audit.id}/process`, { method: 'POST' });
      if (!res.ok) { const data = await res.json(); toast.error(data.error ?? 'Processing failed'); }
    } catch { toast.error('Failed to start processing'); }
  }

  async function handleSubmitSocials() {
    const filled = Object.fromEntries(Object.entries(socialInputs).filter(([, v]) => v?.trim()));
    if (Object.keys(filled).length === 0) { toast.error('Enter at least one social profile URL'); return; }
    setSubmittingSocials(true);
    try {
      const res = await fetch(`/api/analyze-social/${audit.id}/resume`, {
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
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl space-y-7">
          <div className="text-center">
            <h2 className="text-3xl font-semibold text-text-primary">Confirm social platforms</h2>
          </div>

          {/* Brand card */}
          <div className="rounded-xl border border-nativz-border bg-surface p-6 space-y-4">
            <div className="flex items-start gap-4">
              {(() => {
                const domain = faviconDomain(audit.website_url ?? '');
                return domain ? (
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                    alt=""
                    width={48}
                    height={48}
                    className="rounded-lg shrink-0"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <Globe size={40} className="text-text-muted shrink-0" />
                );
              })()}
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-text-primary">{websiteInfo?.title ?? 'Your brand'}</h3>
                {brandDescription ? (
                  <p className="mt-1 text-base text-text-muted leading-relaxed">{brandDescription}</p>
                ) : null}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Social goals</label>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SOCIAL_GOAL_OPTIONS.map((g) => {
                  const checked = socialGoals.includes(g);
                  return (
                    <label
                      key={g}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-base transition-colors',
                        checked
                          ? 'border-accent/50 bg-accent/10 text-text-primary'
                          : 'border-nativz-border bg-transparent text-text-secondary hover:border-nativz-border/80 hover:bg-surface/40',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSocialGoals((prev) =>
                            checked ? prev.filter((x) => x !== g) : [...prev, g]
                          );
                        }}
                        className="h-4 w-4 shrink-0 rounded border-nativz-border accent-accent"
                      />
                      <span>{g}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-nativz-border bg-surface p-6 space-y-4">
            {(['tiktok', 'instagram', 'facebook', 'youtube'] as AuditPlatformKey[]).map(platform => {
              const detected = detectedPlatforms.find(d => d.platform === platform);
              const missing = !detected && !socialInputs[platform]?.trim();
              const value = socialInputs[platform] ?? prettyUrl(detected?.url ?? '');
              return (
                <div key={platform} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-32 shrink-0">
                    <AuditPlatformIcon platform={platform} size="sm" />
                    <span className="text-base text-text-primary font-medium">{PLATFORM_LABELS[platform]}</span>
                  </div>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setSocialInputs(prev => ({ ...prev, [platform]: e.target.value }))}
                    placeholder={missing ? '—' : `${platform}.com/@username`}
                    className={cn(
                      'flex-1 rounded-lg border bg-transparent px-3 py-2 text-base focus:outline-none',
                      missing
                        ? 'border-red-500/40 text-red-300 placeholder:text-red-400/50 focus:border-red-400/60'
                        : 'border-nativz-border text-text-primary placeholder:text-text-muted/50 focus:border-accent/40',
                    )}
                  />
                  {detected ? (
                    <span className="shrink-0 text-sm text-emerald-400">Auto-detected</span>
                  ) : (
                    <span className="shrink-0 text-sm text-red-400">Not found</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-nativz-border bg-surface p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-text-primary">Your competitors</h3>
            </div>
            {[0, 1, 2].map((i) => {
              const url = competitorUrls[i] ?? '';
              const domain = faviconDomain(url);
              const imgError = competitorFaviconErrors[i] ?? false;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                    {domain && !imgError ? (
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                        alt=""
                        width={20}
                        height={20}
                        className="rounded-sm object-contain"
                        onError={() => setCompetitorFaviconErrors((prev) => {
                          const next = [...prev];
                          next[i] = true;
                          return next;
                        })}
                      />
                    ) : (
                      <Globe size={16} className="text-text-muted/50" />
                    )}
                  </span>
                  <input
                    type="text"
                    value={url}
                    disabled={competitorSuggestionsLoading}
                    onChange={(e) => {
                      // Clear favicon error when URL changes so the img retries
                      setCompetitorFaviconErrors((prev) => {
                        const next = [...prev];
                        next[i] = false;
                        return next;
                      });
                      setCompetitorUrls((prev) => {
                        const next = [...prev];
                        next[i] = e.target.value;
                        return next;
                      });
                    }}
                    placeholder={`Competitor ${i + 1} website — e.g. doughco.com`}
                    className={cn(
                      'flex-1 rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-base text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/40',
                      competitorSuggestionsLoading && 'animate-pulse opacity-50 cursor-not-allowed',
                    )}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => router.push('/admin/analyze-social')} className="text-base px-4 py-2.5">
              <ArrowLeft size={16} /> Back
            </Button>
            <Button onClick={() => void startProcessing()} disabled={!hasPlatforms} className="text-base px-6 py-3">
              {hasPlatforms ? 'Start analysis' : 'Add at least one platform'}
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
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/analyze-social')}><ArrowLeft size={12} /> Go back</Button>
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
          <div className="text-center"><Button variant="ghost" size="sm" onClick={() => router.push('/admin/analyze-social')}><ArrowLeft size={14} /> Back</Button></div>
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
          <h2 className="text-lg font-semibold text-text-primary">Analysis failed</h2>
          <p className="mt-2 text-sm text-text-muted">{audit.error_message ?? 'An unknown error occurred.'}</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/analyze-social')}><ArrowLeft size={14} /> Back</Button>
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
      {(() => {
        // Derive brand label + favicon from the audit website URL or website context
        let brandName = websiteContext?.title?.trim() || 'Brand';
        let faviconDomain: string | null = null;
        try {
          if (audit.website_url) {
            const u = new URL(audit.website_url.startsWith('http') ? audit.website_url : `https://${audit.website_url}`);
            faviconDomain = u.hostname.replace(/^www\./, '');
            // Fall back to the capitalised hostname segment if websiteContext is missing
            if (!websiteContext?.title?.trim()) {
              const firstLabel = faviconDomain.split('.')[0];
              brandName = firstLabel.charAt(0).toUpperCase() + firstLabel.slice(1);
            }
          }
        } catch { /* ignore malformed URLs */ }
        const faviconUrl = faviconDomain ? `https://www.google.com/s2/favicons?domain=${faviconDomain}&sz=64` : null;
        return (
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/analyze-social')}><ArrowLeft size={14} /> Back</Button>
            {faviconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={faviconUrl}
                alt=""
                className="h-8 w-8 shrink-0 rounded-md border border-nativz-border bg-white/5"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold text-text-primary truncate">{brandName}</h1>
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
        );
      })()}

      {/* Failed platforms warning — surfaces silent scraper drops so they
          stop hiding inside Vercel logs. */}
      {(() => {
        const failed = audit.prospect_data?.failedPlatforms ?? [];
        if (failed.length === 0) return null;
        return (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-200">
                  Couldn&apos;t scrape {failed.length} platform{failed.length === 1 ? '' : 's'}
                </p>
                <p className="mt-0.5 text-xs text-amber-200/70">
                  The scorecard below is based only on the platforms that returned data.
                </p>
                <ul className="mt-2 space-y-1">
                  {failed.map((f) => (
                    <li key={`${f.platform}-${f.url}`} className="text-xs text-amber-100/90">
                      <span className="font-medium capitalize">{f.platform}</span>
                      {' — '}
                      <span className="font-mono text-[11px] text-amber-100/70">{f.error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Website context */}
      {websiteContext && (
        <div className="rounded-xl border border-nativz-border bg-surface p-6">
          <div className="flex items-center gap-2 mb-3">
            <Globe size={18} className="text-text-muted" />
            <h3 className="text-base font-semibold text-text-primary">Brand overview</h3>
          </div>
          <p className="text-base font-light leading-relaxed text-text-secondary">{websiteContext.description}</p>
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="text-sm bg-accent-surface/30 text-white px-3 py-1 rounded-full">{websiteContext.industry}</span>
            {websiteContext.keywords.slice(0, 5).map(kw => (
              <span key={kw} className="text-sm bg-surface-hover text-white px-3 py-1 rounded-full">{kw}</span>
            ))}
          </div>
        </div>
      )}

      {/* Competitor preview — rendered early so when the scorecard below
          shows green/red per-competitor dots, the reader already knows
          who those competitors are. */}
      {competitors.length > 0 && <CompetitorPreview competitors={competitors} />}

      {/* Scorecard with dots */}
      {scorecard && scorecard.items.length > 0 && (
        <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
          <div className="px-6 py-5 border-b border-nativz-border flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-text-primary">Analysis scorecard</h3>
              <div className="flex items-center gap-4 mt-2">
                {(['good', 'warning', 'poor'] as ScoreStatus[]).map(s => (
                  <span key={s} className="flex items-center gap-1.5 text-sm text-text-muted">
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
        <div className="rounded-xl border border-nativz-border bg-surface p-6">
          <h3 className="text-base font-semibold text-text-primary mb-3">Executive summary</h3>
          <p className="text-base font-light leading-relaxed text-text-secondary">{scorecard.summary}</p>
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
          {activePlatform && <PlatformDetail platform={activePlatform} />}
        </div>
      )}

      {/* Unified competitor landscape — replaces old competitor cards,
          2-chart block, and CompetitorComparisonTable. Only renders when a
          scorecard exists (i.e. pipeline completed successfully). */}
      {scorecard && (
        <LandscapeView
          report={{
            websiteContext: websiteContext,
            platforms,
            competitors,
            scorecard,
            socialGoals: audit.analysis_data?.social_goals,
          }}
        />
      )}

      {/* Source browser — custom grid tuned for audit video shape. The
          shared VideoGrid assumes TopicSearchVideoRow fields (outlier_score,
          platform filters) that don't line up cleanly for audit data. */}
      {videos.length > 0 && <AuditSourceBrowser videos={videos} />}
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
      {/* Profile card — min-h-[248px] keeps the card size identical across
          platforms so switching tabs doesn't reflow the page. Bio line-clamps
          at 3 lines; longer ones truncate instead of pushing the card taller. */}
      <div className="flex min-h-[248px] flex-col rounded-xl border border-nativz-border bg-surface p-6">
        <div className="flex items-start gap-4">
          <AvatarWithFallback
            src={platform.profile.avatarUrl}
            name={platform.profile.displayName}
            className="h-16 w-16 text-lg"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-semibold text-text-primary">{platform.profile.displayName}</h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full capitalize font-medium" style={{ backgroundColor: `${color}25`, color: '#FFFFFF' }}>{platform.platform}</span>
              {platform.profile.verified && <CheckCircle size={16} className="text-accent-text" />}
            </div>
            <a href={platform.profile.profileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-text-muted hover:text-text-primary transition-colors flex items-center gap-1 mt-1">
              @{String(platform.profile.username).replace(/^@+/, '')} <ExternalLink size={12} />
            </a>
            {/* min-h keeps the bio slot a fixed height even when the page has
                no bio, so stat cards don't shift between tabs. */}
            <p className="mt-3 min-h-[4.5rem] text-base font-light leading-relaxed text-text-secondary line-clamp-3">
              {platform.profile.bio || <span className="text-text-muted/60">No bio set.</span>}
            </p>
          </div>
        </div>
        <div className="mt-auto pt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Followers" value={formatNumber(platform.profile.followers)} />
          <StatCard icon={Eye} label="Avg views" value={formatNumber(platform.avgViews)} />
          <StatCard
            icon={TrendingUp}
            label="Engagement"
            value={
              platform.platform === 'facebook' && platform.engagementRate === 0
                ? 'N/A'
                : `${(platform.engagementRate * 100).toFixed(2)}%`
            }
            hint={
              platform.platform === 'facebook' && platform.engagementRate === 0
                ? 'Meta hides engagement counts on Facebook Reels scraping'
                : undefined
            }
          />
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
                <PostThumbnail
                  src={post.thumbnailUrl}
                  platform={post.platform}
                  duration={post.duration}
                />
                <div className="p-2.5">
                  <p className="text-xs font-medium text-text-primary">{formatNumber(post.views)} views</p>
                  <p className="text-[11px] text-text-muted mt-0.5">{formatNumber(post.likes)} likes · {formatNumber(post.comments)} comments</p>
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
    <div className="bg-surface p-5">
      <div className="flex items-center gap-2.5 mb-2">
        <span className={`h-3 w-3 rounded-full shrink-0 ${style.dot}`} />
        <h4 className="text-base font-medium text-text-primary">{item.label}</h4>
      </div>
      <p className="text-sm font-light leading-relaxed text-text-secondary ml-5.5 pl-0.5">{item.prospectValue}</p>
      {item.competitors.length > 0 && (
        <div className="mt-3 ml-5.5 pl-0.5 flex flex-wrap gap-1.5">
          {item.competitors.map(comp => {
            const compStyle = STATUS_COLORS[comp.status];
            return (
              <span key={comp.username} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${compStyle.bg} ${compStyle.text}`} title={comp.value}>
                <span className={`h-1.5 w-1.5 rounded-full ${compStyle.dot}`} />
                @{String(comp.username).replace(/^@+/, '')}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-nativz-border bg-background px-4 py-3" title={hint}>
      <div className="flex items-center gap-1.5 text-text-muted mb-1">
        <Icon size={13} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-lg font-semibold text-text-primary">{value}</p>
    </div>
  );
}

/**
 * Lightweight competitor preview strip shown near the top of the report so
 * the reader knows which accounts the scorecard's green/red per-competitor
 * badges are referring to. The full competitor card grid + comparison table
 * still renders further down.
 */
function CompetitorPreview({ competitors }: { competitors: CompetitorProfile[] }) {
  if (competitors.length === 0) return null;
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-text-primary">Benchmarked against</h3>
        <p className="mt-0.5 text-sm font-light text-text-muted">
          {competitors.length} competitor{competitors.length === 1 ? '' : 's'} at a similar scale —
          these drive the green/red dots in the scorecard below.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {competitors.map((comp) => (
          <a
            key={comp.username}
            href={comp.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2.5 rounded-full border border-nativz-border bg-background px-2 pr-3.5 py-1.5 transition-colors hover:border-nativz-border/80 hover:bg-surface-hover"
          >
            <AvatarWithFallback
              src={comp.avatarUrl}
              name={comp.displayName}
              className="h-7 w-7 text-[10px]"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-primary">{comp.displayName}</p>
              <p className="truncate text-[11px] text-text-muted">
                {formatNumber(comp.followers)} followers · {comp.platform}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

/**
 * Avatar with automatic initials fallback.
 *
 * Handles the two failure modes we see in audit data:
 * 1. `src` is null (old records, platform didn't return one)
 * 2. `src` is a TikTok/Instagram signed CDN URL that 403s after ~24-48h
 *
 * An onError handler on the img swaps the display to the initials pill
 * without a flash of broken image, and we cache the "failed" state per
 * render cycle via React state.
 */
function AvatarWithFallback({
  src,
  name,
  className,
}: {
  src: string | null | undefined;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = (() => {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (parts.length === 0) return '?';
    return parts.map((p) => p[0]?.toUpperCase() ?? '').join('');
  })();

  if (!src || failed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-full bg-surface-hover font-semibold text-text-primary ${className ?? 'h-11 w-11 text-sm'}`}
      >
        {initials}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full object-cover ${className ?? 'h-11 w-11'}`}
    />
  );
}

/**
 * Post thumbnail with graceful fallback for 403'd CDN URLs.
 * Same story as AvatarWithFallback — TikTok/IG signed URLs expire.
 */
function PostThumbnail({
  src,
  platform,
  duration,
}: {
  src: string | null | undefined;
  platform: string;
  duration: number | null;
}) {
  const [failed, setFailed] = useState(false);
  const isVertical =
    platform === 'tiktok' ||
    platform === 'instagram' ||
    (platform === 'youtube' && duration != null && duration <= 60);
  const aspectClass = isVertical ? 'aspect-[9/16]' : 'aspect-video';

  if (!src || failed) {
    return (
      <div className={`bg-surface-hover flex items-center justify-center ${aspectClass}`}>
        <Eye size={20} className="text-text-muted/30" />
      </div>
    );
  }

  return (
    <div className={`bg-surface-hover overflow-hidden ${aspectClass}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      />
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ─── Audit source browser ────────────────────────────────────────────────

type AuditVideoRow = {
  platform: string;
  platform_id: string | null;
  url: string;
  thumbnail_url: string | null;
  description: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  duration_seconds: number | null;
  publish_date: string | null;
  author_username: string | null;
  hashtags: string[] | null;
};

/**
 * Audit-specific source browser. Replaces the shared VideoGrid which
 * assumes TopicSearchVideoRow fields (outlier_score, hook_text, etc.) the
 * audit pipeline doesn't populate — hence "not working at all". This grid
 * shows each scraped post with a thumbnail, sort by views / recent, and a
 * platform filter that only exposes the platforms actually present.
 */
function AuditSourceBrowser({ videos }: { videos: AuditVideoRow[] }) {
  const [sort, setSort] = useState<'views' | 'recent'>('views');
  const [platform, setPlatform] = useState<string>('all');
  const [showAll, setShowAll] = useState(false);

  const availablePlatforms = useMemo(() => {
    const set = new Set<string>();
    for (const v of videos) if (v.platform) set.add(v.platform);
    return ['all', ...Array.from(set)];
  }, [videos]);

  const filteredSorted = useMemo(() => {
    let list = platform === 'all' ? videos : videos.filter((v) => v.platform === platform);
    list = [...list].sort((a, b) => {
      if (sort === 'recent') {
        const da = a.publish_date ? new Date(a.publish_date).getTime() : 0;
        const db = b.publish_date ? new Date(b.publish_date).getTime() : 0;
        return db - da;
      }
      return (b.views ?? 0) - (a.views ?? 0);
    });
    return list;
  }, [videos, platform, sort]);

  // 4 posts per row on desktop — user feedback was that 5-per-row crammed
  // the captions too small to read. Captions dropped entirely; views and
  // engagement take the space.
  const displayed = showAll ? filteredSorted : filteredSorted.slice(0, 12);

  if (videos.length === 0) return null;

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Your feed</h3>
          <p className="mt-0.5 text-sm font-light text-text-muted">
            {videos.length} post{videos.length === 1 ? '' : 's'} scraped across{' '}
            {availablePlatforms.length - 1} platform
            {availablePlatforms.length - 1 === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Sort */}
          <div className="flex overflow-hidden rounded-lg border border-nativz-border">
            {(['views', 'recent'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  sort === s
                    ? 'bg-surface-hover text-text-primary'
                    : 'text-text-muted hover:bg-surface-hover/60 hover:text-text-secondary'
                }`}
              >
                {s === 'views' ? 'Top views' : 'Most recent'}
              </button>
            ))}
          </div>
          {/* Platform filter */}
          {availablePlatforms.length > 2 && (
            <div className="flex overflow-hidden rounded-lg border border-nativz-border">
              {availablePlatforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
                    platform === p
                      ? 'bg-surface-hover text-text-primary'
                      : 'text-text-muted hover:bg-surface-hover/60 hover:text-text-secondary'
                  }`}
                >
                  {p === 'all' ? 'All' : p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {displayed.map((v) => (
          <a
            key={`${v.platform}-${v.platform_id ?? v.url}`}
            href={v.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block overflow-hidden rounded-xl border border-nativz-border bg-background transition-colors hover:border-nativz-border/80"
          >
            <PostThumbnail
              src={v.thumbnail_url}
              platform={v.platform}
              duration={v.duration_seconds}
            />
            <div className="p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-lg font-semibold text-text-primary">
                  {formatNumber(v.views ?? 0)}
                </p>
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  views
                </p>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-text-muted">
                <span className="inline-flex items-center gap-1">
                  <Heart size={12} aria-hidden />
                  {formatNumber(v.likes ?? 0)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageCircle size={12} aria-hidden />
                  {formatNumber(v.comments ?? 0)}
                </span>
                {typeof v.shares === 'number' && v.shares > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Share2 size={12} aria-hidden />
                    {formatNumber(v.shares)}
                  </span>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>

      {filteredSorted.length > 12 && !showAll && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="rounded-lg border border-nativz-border px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:border-nativz-border/80 hover:text-text-primary"
          >
            Show {filteredSorted.length - 12} more
          </button>
        </div>
      )}
    </div>
  );
}
