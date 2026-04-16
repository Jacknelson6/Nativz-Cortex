'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
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
  MapPin,
  Plus,
  X,
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
import { AuditShareButton } from '@/components/audit/audit-share-button';
import { TrackCompetitorButton } from '@/components/audit/track-competitor-button';
import { TikTokMark } from '@/components/integrations/tiktok-mark';
import { InstagramMark } from '@/components/integrations/instagram-mark';
import { YouTubeMark } from '@/components/integrations/youtube-mark';
import type { PlatformReport, CompetitorProfile, AuditScorecard, ScorecardItem, ScoreStatus, WebsiteContext, FailedPlatform } from '@/lib/audit/types';
import type { TopicSearchVideoRow } from '@/lib/scrapers/types';

interface AuditRecord {
  id: string;
  website_url: string | null;
  tiktok_url: string;
  status: string;
  /** Persisted user edits from the confirm-platforms screen / resume route. */
  social_urls: Record<string, string> | null;
  prospect_data: {
    websiteContext?: WebsiteContext | null;
    platforms?: PlatformReport[];
    detectedSocialLinks?: { platform: string; url: string; username: string }[];
    failedPlatforms?: FailedPlatform[];
  } | null;
  competitors_data: CompetitorProfile[] | null;
  scorecard: AuditScorecard | null;
  videos_data: TopicSearchVideoRow[] | null;
  analysis_data: {
    social_goals?: string[];
    suggested_competitors?: { name: string; website: string; why?: string }[];
    competitor_urls_override?: string[];
  } | null;
  error_message: string | null;
  created_at: string;
  /** Optional pre-attach — set on the confirm-platforms screen. Null means
   *  the user chose not to attach (or hasn't yet). */
  attached_client_id?: string | null;
}

const STATUS_COLORS: Record<ScoreStatus, { dot: string; bg: string; text: string; label: string }> = {
  good: { dot: 'bg-emerald-400', bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Good' },
  warning: { dot: 'bg-amber-400', bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Needs work' },
  poor: { dot: 'bg-red-400', bg: 'bg-red-500/10', text: 'text-red-400', label: 'Not good' },
};

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: '#FF0050',
  instagram: '#C13584',
  youtube: '#FF0000',
};

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
};

const PLATFORM_PRIORITY: Record<string, number> = {
  tiktok: 0,
  instagram: 1,
  youtube: 2,
};

function sortPlatforms<T extends { platform: string }>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      (PLATFORM_PRIORITY[a.platform] ?? 99) - (PLATFORM_PRIORITY[b.platform] ?? 99),
  );
}

/**
 * Standardized platform icon — renders the brand mark directly on transparent
 * background with no tile wrappers. YouTube keeps its full red mark.
 * Instagram uses the gradient 'full' variant so it shows the brand gradient
 * without needing a coloured tile behind it.
 */
function AuditPlatformIcon({ platform, size = 'md' }: { platform: AuditPlatformKey; size?: 'sm' | 'md' }) {
  // Larger by default — the confirm-platforms row reads cramped at the old
  // 28px. Keeps the small variant at 24px for any inline use.
  const iconSize = size === 'sm' ? 24 : 36;

  if (platform === 'youtube') {
    return (
      <span className="inline-flex shrink-0 items-center justify-center" aria-hidden>
        <YouTubeMark variant="full" size={iconSize} />
      </span>
    );
  }
  if (platform === 'tiktok') {
    return (
      <span className="inline-flex shrink-0 items-center justify-center text-text-primary" aria-hidden>
        <TikTokMark size={iconSize} />
      </span>
    );
  }
  // instagram
  return (
    <span className="inline-flex shrink-0 items-center justify-center" aria-hidden>
      <InstagramMark variant="full" size={iconSize} />
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

type AuditPlatformKey = 'tiktok' | 'instagram' | 'youtube';

export function AuditReport({ audit: initialAudit }: { audit: AuditRecord }) {
  const router = useRouter();
  const [audit, setAudit] = useState(initialAudit);
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [activePlatformTab, setActivePlatformTab] = useState<string | null>(null);
  const [socialInputs, setSocialInputs] = useState<Partial<Record<AuditPlatformKey, string>>>({});
  const [competitorUrls, setCompetitorUrls] = useState<string[]>(['', '', '']);
  const [competitorFaviconErrors, setCompetitorFaviconErrors] = useState<boolean[]>([false, false, false]);
  // Candidates from both tiers are kept side-by-side so the user can mix
  // national and local picks in a single audit. Each candidate carries its
  // originating scope so we can render the right icon (Globe / MapPin).
  type CompetitorScope = 'national' | 'local';
  type ScopedCandidate = { name: string; website: string; why: string; scope: CompetitorScope };
  const [suggestedCandidates, setSuggestedCandidates] = useState<ScopedCandidate[]>([]);
  const [selectedCompetitorWebsites, setSelectedCompetitorWebsites] = useState<Set<string>>(new Set());
  const [generatingCompetitors, setGeneratingCompetitors] = useState(false);
  // Manual entries the user typed in — merged with auto-generated candidates
  // at submit time. Stored as raw strings; normalized when pushed into the
  // selected-websites set.
  const [manualCompetitorInput, setManualCompetitorInput] = useState('');
  const [manualCompetitorWebsites, setManualCompetitorWebsites] = useState<string[]>([]);
  const MAX_PICKED_COMPETITORS = 2;

  // Pre-audit attach: optionally pair the audit with a client on the
  // confirm screen so the post-completion hook auto-creates the benchmark
  // row (no second click on the report). Falls back to the retroactive
  // post-report dialog when left null.
  const [submittingSocials, setSubmittingSocials] = useState(false);
  const [detectedPlatforms, setDetectedPlatforms] = useState<{ platform: string; url: string; username: string }[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [websiteInfo, setWebsiteInfo] = useState<{ title: string; industry: string; scope?: 'local' | 'national' | null } | null>(null);
  const SOCIAL_GOAL_OPTIONS = [
    'Build brand awareness',
    'Go viral and maximize engagement',
    'Drive foot traffic and local visits',
    'Turn followers into paying customers',
    'Create content to use for higher-performing ads',
    'Grow a loyal community',
  ] as const;
  const [socialGoals, setSocialGoals] = useState<string[]>([]);
  const [brandDescription, setBrandDescription] = useState<string>('');

  // Auto-detect socials for pending audits (don't start processing yet)
  useEffect(() => {
    if (audit.status === 'pending') void detectSocials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rehydrate state from persisted audit data on revisits. The confirm screen
  // clears socialInputs + competitorUrls + websiteInfo on unmount; without
  // this block the user would come back to an empty form.
  useEffect(() => {
    if (audit.status !== 'confirming_platforms') return;
    const prospectData = audit.prospect_data;
    const analysisData = audit.analysis_data;

    if (prospectData?.websiteContext) {
      const { title, industry, description } = prospectData.websiteContext;
      const scope = (prospectData.websiteContext as { scope?: 'local' | 'national' | null }).scope ?? null;
      if (title || industry) setWebsiteInfo({ title: title ?? '', industry: industry ?? '', scope });
      if (description) setBrandDescription(description);
    }

    // Seed detectedPlatforms (powers the Auto-detected / Not found badges)
    const detectedLinks = prospectData?.detectedSocialLinks ?? [];
    if (detectedLinks.length > 0) setDetectedPlatforms(detectedLinks);

    // Seed socialInputs — prefer persisted user edits (social_urls column),
    // fall back to the scraper's detectedSocialLinks. Only skip if user has
    // already typed into an input this session.
    setSocialInputs((current) => {
      if (Object.values(current).some((v) => v?.trim())) return current;
      const preset: Partial<Record<AuditPlatformKey, string>> = {};
      const allowed = ['tiktok', 'instagram', 'youtube'] as const;

      // First: user's own persisted URLs from the social_urls column
      const userUrls = (audit.social_urls ?? {}) as Partial<Record<string, string>>;
      for (const p of allowed) {
        const u = userUrls[p];
        if (u && u.trim()) preset[p] = prettyUrl(u);
      }
      // Then: detected scrapes — only fill slots the user didn't set
      for (const d of detectedLinks) {
        if (d.url && allowed.includes(d.platform as AuditPlatformKey) && !preset[d.platform as AuditPlatformKey]) {
          preset[d.platform as AuditPlatformKey] = prettyUrl(d.url);
        }
      }
      return preset;
    });

    // Seed the generate-competitors list on revisit so the user sees the
    // same candidates they had before (no re-burning LLM tokens).
    const persistedCandidates = analysisData?.suggested_competitors ?? [];
    if (persistedCandidates.length > 0) {
      setSuggestedCandidates((current) =>
        current.length > 0
          ? current
          : persistedCandidates.map((c) => ({
              name: c.name,
              website: c.website,
              why: c.why ?? '',
              // Persisted rows predate the mixed-scope layout; assume national
              // until the user regenerates and gets fresh, scope-tagged rows.
              scope: 'national' as const,
            })),
      );
    }
    // Seed previously-selected picks
    const persistedOverride = analysisData?.competitor_urls_override ?? [];
    if (persistedOverride.length > 0) {
      setSelectedCompetitorWebsites((current) =>
        current.size > 0 ? current : new Set(persistedOverride),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit.status, audit.id]);

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
    const platforms = sortPlatforms(audit.prospect_data?.platforms ?? []);
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
        setWebsiteInfo(data.websiteContext ? { title: data.websiteContext.title, industry: data.websiteContext.industry, scope: data.websiteContext.scope ?? null } : null);
        if (data.websiteContext?.description) {
          setBrandDescription(data.websiteContext.description);
        }
        // Pre-fill social inputs with prettified URLs (scrapers re-add https:// on submit)
        const preset: Partial<Record<AuditPlatformKey, string>> = {};
        for (const d of data.detectedPlatforms ?? []) {
          if (d.url && (['tiktok', 'instagram', 'youtube'] as const).includes(d.platform as AuditPlatformKey)) {
            preset[d.platform as AuditPlatformKey] = prettyUrl(d.url);
          }
        }
        setSocialInputs(preset);

        // Competitor suggestions are now explicit: the user clicks
        // "Generate competitors" on the confirm screen and chooses a
        // scope (national/local). No LLM burn on mount.
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

  async function generateCompetitors() {
    if (generatingCompetitors) return;
    setGeneratingCompetitors(true);
    try {
      // DTC / online-only brands don't have "local" competitors in any
      // meaningful sense — forcing a local fetch yields hallucinations
      // ("Viet Street") dressed up with a misleading pin icon. When the
      // LLM tagged the business as national, skip the local tier entirely.
      // Otherwise (local brands, unknown scope) pull both so the user can
      // mix tiers.
      const isNationalOnly = websiteInfo?.scope === 'national';
      const fetches: Array<Promise<Response>> = [
        fetch(`/api/analyze-social/${audit.id}/suggest-competitors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope: 'national' }),
        }),
      ];
      const fetchScopes: CompetitorScope[] = ['national'];
      if (!isNationalOnly) {
        fetches.push(
          fetch(`/api/analyze-social/${audit.id}/suggest-competitors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scope: 'local' }),
          }),
        );
        fetchScopes.push('local');
      }
      const responses = await Promise.all(fetches);

      const merged: ScopedCandidate[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < responses.length; i++) {
        const res = responses[i];
        const scope = fetchScopes[i];
        if (!res.ok) continue;
        try {
          const d = (await res.json()) as {
            candidates?: { name: string; website: string; why: string }[];
          };
          for (const c of d.candidates ?? []) {
            const key = c.website?.toLowerCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            merged.push({ ...c, scope });
          }
        } catch {
          /* skip malformed payload */
        }
      }

      setSuggestedCandidates(merged);
      setSelectedCompetitorWebsites(new Set());
    } catch {
      /* swallow — the list just won't populate, user can retry */
    } finally {
      setGeneratingCompetitors(false);
    }
  }

  // Auto-run the first generate pass when the user lands on the confirm
  // screen — no more "Click Generate to see candidates" cold-start state.
  // Only fires when we have a websiteContext (otherwise the LLM has nothing
  // to work from) and we haven't generated yet this session.
  useEffect(() => {
    if (audit.status !== 'confirming_platforms') return;
    if (!websiteInfo || suggestedCandidates.length > 0 || generatingCompetitors) return;
    void generateCompetitors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit.status, websiteInfo]);

  function addManualCompetitor() {
    const raw = manualCompetitorInput.trim();
    if (!raw) return;
    // Normalize: strip protocol + trailing slash so dedup vs. auto-generated
    // candidates compares apples-to-apples.
    const normalized = raw.replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase();
    if (!normalized || manualCompetitorWebsites.includes(normalized)) {
      setManualCompetitorInput('');
      return;
    }
    const url = `https://${normalized}`;
    setManualCompetitorWebsites((prev) => [...prev, normalized]);
    setManualCompetitorInput('');
    // Auto-select so the user doesn't have to add + click pick.
    setSelectedCompetitorWebsites((prev) => {
      if (prev.size >= MAX_PICKED_COMPETITORS) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }

  function removeManualCompetitor(normalized: string) {
    const url = `https://${normalized}`;
    setManualCompetitorWebsites((prev) => prev.filter((w) => w !== normalized));
    setSelectedCompetitorWebsites((prev) => {
      if (!prev.has(url)) return prev;
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
  }

  function toggleCompetitorPick(website: string) {
    setSelectedCompetitorWebsites((prev) => {
      const next = new Set(prev);
      if (next.has(website)) {
        next.delete(website);
      } else if (next.size < MAX_PICKED_COMPETITORS) {
        next.add(website);
      }
      return next;
    });
  }

  async function startProcessing() {
    // Save any manual social URLs before processing
    const filled = Object.fromEntries(Object.entries(socialInputs).filter(([, v]) => v?.trim()));
    // Prefer the user's picks from the Generate flow; fall back to any
    // manually-typed legacy competitor inputs if we're revisiting an old audit.
    // Normalize every URL — the resume route validates each entry with
    // Zod's .url() which requires a scheme, and LLM candidates come back
    // as bare domains (e.g. "doughco.com") that would otherwise fail silently.
    const normalize = (u: string) => {
      const trimmed = u.trim();
      if (!trimmed) return '';
      return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    };
    const picked = Array.from(selectedCompetitorWebsites).map(normalize).filter(Boolean);
    const legacy = competitorUrls.map(normalize).filter(Boolean);
    const cleanedCompetitors = picked.length > 0 ? picked : legacy;
    if (Object.keys(filled).length > 0 || cleanedCompetitors.length > 0) {
      await fetch(`/api/analyze-social/${audit.id}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          social_urls: filled,
          competitor_urls: cleanedCompetitors,
          social_goals: socialGoals,
        }),
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

  const platforms = sortPlatforms(audit.prospect_data?.platforms ?? []);
  const websiteContext = audit.prospect_data?.websiteContext ?? null;
  const competitors = audit.competitors_data ?? [];
  const scorecard = audit.scorecard;
  const videos = (audit.videos_data ?? []) as TopicSearchVideoRow[];
  const activePlatform = platforms.find(p => p.platform === activePlatformTab) ?? platforms[0];

  // ── Detecting socials (initial website scrape + competitor suggest) ────
  if (audit.status === 'pending' && detecting) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-10 animate-fade-slide-in">
        <div className="w-full max-w-2xl">
          <div className="rounded-xl border border-nativz-border bg-surface p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-accent/30 bg-accent/10">
              <Loader2 size={28} className="animate-spin text-accent-text" />
            </div>
            <h2 className="mt-5 text-3xl font-semibold text-text-primary">Scanning website</h2>
            <p className="mt-2 text-lg text-text-muted">
              Pulling social profiles and competitors from{' '}
              <span className="text-text-secondary">
                {audit.website_url?.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')}
              </span>
            </p>
            <p className="mt-4 text-base text-text-muted/80">
              This takes a few seconds — we'll pre-fill everything on the next screen.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Confirming platforms ───────────────────────────────────────────────
  if (audit.status === 'confirming_platforms' || (audit.status === 'pending' && detectedPlatforms.length >= 0 && !detecting)) {
    const hasPlatforms = Object.values(socialInputs).some(v => v?.trim());
    const hasGoals = socialGoals.length > 0;
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
              <label className="text-sm font-medium text-text-secondary">What are your biggest goals for social media?</label>
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
                        className="sr-only"
                      />
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                          checked
                            ? 'border-accent bg-accent'
                            : 'border-nativz-border/80 bg-background/40',
                        )}
                      >
                        {checked ? (
                          <Check size={14} strokeWidth={3} className="text-background" />
                        ) : null}
                      </span>
                      <span className="leading-snug">{g}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-nativz-border bg-surface p-6 space-y-4">
            {(['tiktok', 'instagram', 'youtube'] as AuditPlatformKey[]).map(platform => {
              const detected = detectedPlatforms.find(d => d.platform === platform);
              const typed = socialInputs[platform]?.trim();
              // Three states:
              //  - auto-detected: scraper found it AND user hasn't changed it → "Auto-detected"
              //  - manually entered: user has typed a value for an undetected platform → "Detected"
              //  - empty: no scraper hit AND no input → "Not found" + red styling
              const missing = !detected && !typed;
              const manuallyAdded = !detected && Boolean(typed);
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
                  ) : manuallyAdded ? (
                    <span className="shrink-0 text-sm text-emerald-400">Detected</span>
                  ) : (
                    <span className="shrink-0 text-sm text-red-400">Not found</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-nativz-border bg-surface p-6 space-y-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h3 className="text-xl font-semibold text-text-primary">Your competitors</h3>
              {/* Small icon-only regenerate; the first pass auto-runs on
                  mount so there's no big "Generate" CTA needed anymore. */}
              <button
                type="button"
                onClick={() => void generateCompetitors()}
                disabled={generatingCompetitors}
                title="Regenerate competitor suggestions"
                aria-label="Regenerate competitors"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-nativz-border bg-surface text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
              >
                <RefreshCw
                  size={14}
                  className={generatingCompetitors ? 'animate-spin' : ''}
                  aria-hidden
                />
              </button>
            </div>

            {(suggestedCandidates.length > 0 || manualCompetitorWebsites.length > 0) && (
              <div className="flex items-center gap-4 text-sm">
                <span className="text-text-muted">
                  {selectedCompetitorWebsites.size} of {MAX_PICKED_COMPETITORS} selected
                </span>
                {/* Scope legend only when the LLM actually returned a mix —
                    DTC/national-only brands have no local tier to explain. */}
                {websiteInfo?.scope !== 'national' && (
                  <>
                    <span className="flex items-center gap-1.5 text-text-muted">
                      <Globe size={14} className="text-accent-text/70" aria-hidden />
                      National
                    </span>
                    <span className="flex items-center gap-1.5 text-text-muted">
                      <MapPin size={14} className="text-emerald-400/70" aria-hidden />
                      Local
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Initial loading — no candidates yet, first auto-gen still
                running. After the first pass lands the empty state never
                re-appears since regenerate doesn't wipe the list until a
                new one arrives. */}
            {generatingCompetitors && suggestedCandidates.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-muted">
                <Loader2 size={14} className="animate-spin" />
                Finding competitors for your brand...
              </div>
            )}

            {/* Candidate list — national and local mixed, each row tagged with a scope icon. */}
            {suggestedCandidates.length > 0 && (
              <ul className="space-y-2">
                {suggestedCandidates.map((c) => {
                  const picked = selectedCompetitorWebsites.has(c.website);
                  const atLimit = !picked && selectedCompetitorWebsites.size >= MAX_PICKED_COMPETITORS;
                  const isNational = c.scope === 'national';
                  // Hide the scope badge entirely for DTC brands — every
                  // candidate would be "National" and the badge just adds
                  // visual noise.
                  const showScopeBadge = websiteInfo?.scope !== 'national';
                  const ScopeIcon = isNational ? Globe : MapPin;
                  const scopeColor = isNational ? 'text-accent-text/80' : 'text-emerald-400/80';
                  const scopeLabel = isNational ? 'National' : 'Local';
                  return (
                    <li key={c.website}>
                      <button
                        type="button"
                        onClick={() => toggleCompetitorPick(c.website)}
                        disabled={atLimit}
                        className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                          picked
                            ? 'border-accent/60 bg-accent-surface/40'
                            : 'border-nativz-border bg-surface hover:bg-surface-hover'
                        } ${atLimit ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                        title={c.why || undefined}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${faviconDomain(c.website) ?? c.website}&sz=32`}
                          alt=""
                          width={22}
                          height={22}
                          className="rounded-sm object-contain shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-medium text-text-primary truncate">{c.name}</span>
                            {showScopeBadge && (
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border border-nativz-border/60 bg-background/50 px-2 py-0.5 text-[11px] font-medium ${scopeColor}`}
                                aria-label={scopeLabel}
                                title={scopeLabel}
                              >
                                <ScopeIcon size={11} aria-hidden />
                                {scopeLabel}
                              </span>
                            )}
                            <span className="text-sm text-text-muted truncate">{prettyUrl(c.website)}</span>
                          </div>
                          {c.why && (
                            <p className="text-sm text-text-muted mt-1 line-clamp-2">{c.why}</p>
                          )}
                        </div>
                        {/* Clear, labeled select state — replaces the tiny
                            18px checkbox that was easy to miss. */}
                        <span
                          className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                            picked
                              ? 'bg-accent text-white'
                              : atLimit
                              ? 'border border-nativz-border/50 text-text-muted'
                              : 'border border-accent/40 text-accent-text'
                          }`}
                          aria-hidden
                        >
                          {picked ? (
                            <>
                              <Check size={12} /> Selected
                            </>
                          ) : atLimit ? (
                            'Max 3 picked'
                          ) : (
                            <>
                              <Plus size={12} /> Select
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Manual-entry row — for when the user already knows a
                competitor that didn't show up in the auto-generated list.
                Accepts a website URL or bare domain. */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-primary">
                Add a competitor manually
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={manualCompetitorInput}
                  onChange={(e) => setManualCompetitorInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addManualCompetitor();
                    }
                  }}
                  placeholder="example.com"
                  className="flex-1 rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addManualCompetitor}
                  disabled={!manualCompetitorInput.trim()}
                  className="text-sm"
                >
                  <Plus size={14} /> Add
                </Button>
              </div>
              {manualCompetitorWebsites.length > 0 && (
                <ul className="flex flex-wrap gap-1.5 pt-1">
                  {manualCompetitorWebsites.map((w) => (
                    <li
                      key={w}
                      className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-surface/40 px-2.5 py-1 text-xs text-text-primary"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${w}&sz=32`}
                        alt=""
                        className="h-3.5 w-3.5 rounded-[2px] object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.visibility = 'hidden';
                        }}
                      />
                      <span className="max-w-[180px] truncate">{w}</span>
                      <button
                        type="button"
                        onClick={() => removeManualCompetitor(w)}
                        className="rounded-full p-0.5 text-text-muted hover:bg-accent/20 hover:text-text-primary transition-colors"
                        aria-label={`Remove ${w}`}
                      >
                        <X size={10} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Client attach is now picked on the entry screen and stamped at
              create time — no second picker here. The post-completion
              AttachToClientDialog still handles retroactive attaches for
              audits started without a client. */}

          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => router.push('/admin/analyze-social')} className="text-base px-4 py-2.5">
              <ArrowLeft size={16} /> Back
            </Button>
            <Button onClick={() => void startProcessing()} disabled={!hasPlatforms || !hasGoals} className="text-base px-6 py-3">
              {!hasPlatforms ? 'Add at least one platform' : !hasGoals ? 'Select a goal to start' : 'Start analysis'}
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
                // Prefer the LLM-extracted business name from the website
                // scrape — already properly spaced + cased ("Ryse Supplements"
                // instead of "Rysesupps", "Malai Kitchen" instead of
                // "Malaikitchen"). Fall back to the domain label when the
                // scrape hasn't landed yet.
                const ctxTitle =
                  websiteInfo?.title?.trim() ||
                  (audit.prospect_data?.websiteContext as { title?: string } | undefined)?.title?.trim();
                let brand: string;
                if (ctxTitle) {
                  brand = ctxTitle;
                } else if (audit.website_url) {
                  try {
                    const u = new URL(audit.website_url.startsWith('http') ? audit.website_url : `https://${audit.website_url}`);
                    const firstLabel = u.hostname.replace(/^www\./, '').split('.')[0];
                    brand = firstLabel.charAt(0).toUpperCase() + firstLabel.slice(1);
                  } catch {
                    brand = 'this brand';
                  }
                } else {
                  return 'Analyzing prospect socials';
                }
                const possessive = brand.endsWith('s') ? `${brand}'` : `${brand}'s`;
                return `Analyzing ${possessive} socials`;
              })()}
            </h2>
          </div>
          <div className="text-center mb-4">
            <EncryptedText key={`stage-${stageIndex}`} text={PROCESSING_STAGES[stageIndex]} revealDelayMs={40} className="text-sm text-text-muted" />
          </div>
          {/* List of exactly what we're analyzing — so the user can confirm
              their submitted platforms + competitors are actually in the run.
              Previously this screen was opaque; scraping could silently drop
              manual entries and the user would only notice on the report. */}
          {(() => {
            const socials = (audit.social_urls as Record<string, string> | null) ?? {};
            const platformList = Object.entries(socials)
              .filter(([, v]) => !!v?.trim())
              .map(([p]) => PLATFORM_LABELS[p as AuditPlatformKey] ?? p);
            const competitorList =
              ((audit.analysis_data as { competitor_urls_override?: string[] } | null)?.competitor_urls_override ?? [])
                .map((u) => u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, ''));
            if (platformList.length === 0 && competitorList.length === 0) return null;
            return (
              <div className="mb-4 space-y-1 text-center">
                {platformList.length > 0 && (
                  <p className="text-[11px] text-text-muted/70">
                    Platforms: {platformList.join(', ')}
                  </p>
                )}
                {competitorList.length > 0 && (
                  <p className="text-[11px] text-text-muted/70">
                    Competitors: {competitorList.join(', ')}
                  </p>
                )}
              </div>
            );
          })()}
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
            {(['tiktok', 'instagram', 'youtube'] as AuditPlatformKey[]).map(platform => (
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
              <AuditShareButton auditId={audit.id} />
            </div>
          </div>
        );
      })()}

      {/* Website context */}
      {/* Unified brand overview — prospect on top, then "Benchmarked against"
          with each competitor stacked. Each row shows platform badges (TT /
          IG / YT) that link to the brand's profile on that platform. */}
      {(websiteContext || competitors.length > 0) && (
        <BrandOverviewCard
          websiteContext={websiteContext}
          platforms={platforms}
          competitors={competitors}
        />
      )}

      {/* Platform tabs + active platform detail. Tabs select which of the
          prospect's platforms the analysis section below shows. */}
      {platforms.length > 0 && (
        <div className="space-y-4">
          {platforms.length > 1 && (
            <div className="flex items-center rounded-lg border border-nativz-border bg-surface p-0.5 w-fit">
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
          {activePlatform && <PlatformDetail platform={activePlatform} />}
        </div>
      )}

      {/* Analysis scorecard — list view only, each item is a parent card
          with sub-rows for prospect + each competitor and an R/Y/G dot. */}
      {scorecard && scorecard.items.length > 0 && (
        <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
          <div className="px-6 py-5 border-b border-nativz-border">
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-nativz-border">
            {scorecard.items.map((item, i) => (
              <ScorecardCard
                key={i}
                item={item}
                prospectLabel={websiteContext?.title ?? 'Your brand'}
              />
            ))}
          </div>
        </div>
      )}

      {/* Competitors */}
      {competitors.length > 0 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-nativz-border bg-surface p-6">
            <h3 className="text-base font-semibold text-text-primary mb-4">Competitors</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {competitors.map(comp => {
                const emDash = <span className="text-text-muted">—</span>;
                // Stub competitors = we surfaced the brand but couldn't scrape
                // them (website 404, no socials, platform 403). Showing 0 for
                // followers / engagement is misleading — em-dash + tooltip is
                // honest.
                const followersNode = comp.isStub
                  ? emDash
                  : formatNumber(comp.followers);
                const engagementNode = comp.isStub
                  ? emDash
                  : comp.platform === 'facebook' && comp.engagementRate === 0
                    ? <span className="text-text-muted" title="Meta blocks engagement counts on Facebook Reels scraping">—</span>
                    : `${(comp.engagementRate * 100).toFixed(2)}%`;
                const viewsNode = comp.isStub ? emDash : formatNumber(comp.avgViews);
                const freqNode = comp.isStub ? emDash : comp.postingFrequency;
                return (
                <div
                  key={comp.username}
                  className={`rounded-lg border bg-background p-4 ${comp.isStub ? 'border-nativz-border/60 opacity-80' : 'border-nativz-border'}`}
                  title={comp.isStub ? 'Scrape failed — we found this brand but couldn’t pull live stats' : undefined}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <AvatarWithFallback
                      src={comp.avatarUrl}
                      name={comp.displayName}
                      className="h-11 w-11 text-sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-text-primary truncate">{comp.displayName}</p>
                        {comp.isStub && (
                          <span className="shrink-0 rounded-full border border-nativz-border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-text-muted">
                            Data unavailable
                          </span>
                        )}
                      </div>
                      <a href={comp.profileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-text hover:underline flex items-center gap-1 truncate">
                        @{String(comp.username).replace(/^@+/, '')} <ExternalLink size={10} className="shrink-0" />
                      </a>
                    </div>
                    <TrackCompetitorButton
                      auditId={audit.id}
                      competitor={comp}
                      defaultClientId={(audit as { attached_client_id?: string | null }).attached_client_id ?? null}
                      disabled={Boolean(comp.isStub)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-xs text-text-muted">Followers</span><p className="font-semibold text-text-primary">{followersNode}</p></div>
                    <div>
                      <span className="text-xs text-text-muted">Engagement</span>
                      <p className="font-semibold text-text-primary">{engagementNode}</p>
                    </div>
                    <div><span className="text-xs text-text-muted">Avg views</span><p className="font-semibold text-text-primary">{viewsNode}</p></div>
                    <div><span className="text-xs text-text-muted">Frequency</span><p className="font-semibold text-text-primary">{freqNode}</p></div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          <CompetitorComparisonTable
            activePlatform={activePlatform}
            competitors={competitors}
          />
        </div>
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
  /**
   * 30-day daily chart data. For each day in the range we either use the
   * real per-video metrics (if a video was posted that day, averaged) or
   * linearly interpolate from the nearest known data points. This gives a
   * smooth, continuous line instead of 3-4 dots separated by multi-week gaps.
   */
  const dailyChartData = useMemo(() => {
    type DayRow = { date: string; dayMs: number; views: number; likes: number; comments: number; er: number; isReal: boolean };
    const followers = platform.profile.followers || 1;
    const datedVideos = platform.videos
      .filter((v) => v.publishDate)
      .map((v) => {
        const t = new Date(v.publishDate!);
        const dayMs = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
        const er = ((v.likes + v.comments + v.shares) / followers) * 100;
        return { dayMs, views: v.views, likes: v.likes, comments: v.comments, er };
      })
      .filter((v) => !Number.isNaN(v.dayMs));

    if (datedVideos.length === 0) return [];

    const byDay = new Map<number, { views: number[]; likes: number[]; comments: number[]; er: number[] }>();
    for (const v of datedVideos) {
      if (!byDay.has(v.dayMs)) byDay.set(v.dayMs, { views: [], likes: [], comments: [], er: [] });
      const d = byDay.get(v.dayMs)!;
      d.views.push(v.views); d.likes.push(v.likes); d.comments.push(v.comments); d.er.push(v.er);
    }

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

    const realDays: DayRow[] = Array.from(byDay.entries())
      .sort(([a], [b]) => a - b)
      .map(([dayMs, d]) => ({
        dayMs,
        date: new Date(dayMs).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        views: Math.round(avg(d.views)),
        likes: Math.round(avg(d.likes)),
        comments: Math.round(avg(d.comments)),
        er: parseFloat(avg(d.er).toFixed(2)),
        isReal: true,
      }));

    const now = new Date();
    const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const thirtyDaysAgoMs = todayMs - 30 * 86_400_000;

    const startMs = Math.max(thirtyDaysAgoMs, realDays[0]?.dayMs ?? thirtyDaysAgoMs);
    const endMs = Math.min(todayMs, Math.max(realDays[realDays.length - 1]?.dayMs ?? todayMs, startMs));

    const realByMs = new Map(realDays.map((r) => [r.dayMs, r]));
    const sortedRealMs = realDays.map((r) => r.dayMs);

    function interpolate(dayMs: number, key: 'views' | 'likes' | 'comments' | 'er'): number {
      let lo = -1;
      let hi = -1;
      for (let i = sortedRealMs.length - 1; i >= 0; i--) {
        if (sortedRealMs[i] <= dayMs) { lo = i; break; }
      }
      for (let i = 0; i < sortedRealMs.length; i++) {
        if (sortedRealMs[i] >= dayMs) { hi = i; break; }
      }
      if (lo === -1 && hi === -1) return 0;
      if (lo === -1) return realByMs.get(sortedRealMs[hi])![key];
      if (hi === -1) return realByMs.get(sortedRealMs[lo])![key];
      if (lo === hi) return realByMs.get(sortedRealMs[lo])![key];
      const loRow = realByMs.get(sortedRealMs[lo])!;
      const hiRow = realByMs.get(sortedRealMs[hi])!;
      const frac = (dayMs - sortedRealMs[lo]) / (sortedRealMs[hi] - sortedRealMs[lo]);
      return loRow[key] + (hiRow[key] - loRow[key]) * frac;
    }

    const result: DayRow[] = [];
    for (let ms = startMs; ms <= endMs; ms += 86_400_000) {
      const real = realByMs.get(ms);
      if (real) {
        result.push(real);
      } else {
        result.push({
          dayMs: ms,
          date: new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' }),
          views: Math.round(interpolate(ms, 'views')),
          likes: Math.round(interpolate(ms, 'likes')),
          comments: Math.round(interpolate(ms, 'comments')),
          er: parseFloat(interpolate(ms, 'er').toFixed(2)),
          isReal: false,
        });
      }
    }
    return result;
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

      {/* Performance chart — 30-day daily line with selectable metric.
          Interpolates between known data points for days without posts so the
          line is continuous and readable. Metric selector lets the user flip
          between Views, Engagement Rate, Likes, and Comments on one chart. */}
      {dailyChartData.length > 1 && (
        <DailyPerformanceChart data={dailyChartData} platform={platform.platform} color={color} />
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

/**
 * Scorecard category card. Renders the dimension as a parent card with one
 * sub-row per brand (prospect first, then each competitor). Each sub-row is
 * a R/Y/G dot + the brand label + the dimension's value for that brand —
 * the user reads "us vs each competitor on this dimension" at a glance.
 */
function ScorecardCard({
  item,
  prospectLabel,
}: {
  item: ScorecardItem;
  prospectLabel: string;
}) {
  const rows: { label: string; status: ScoreStatus; value: string; isProspect: boolean }[] = [
    { label: prospectLabel, status: item.prospectStatus, value: item.prospectValue, isProspect: true },
    ...item.competitors.map((c) => ({
      label: `@${String(c.username).replace(/^@+/, '')}`,
      status: c.status,
      value: c.value,
      isProspect: false,
    })),
  ];
  return (
    <div className="bg-surface p-5 space-y-3">
      <div>
        <h4 className="text-base font-medium text-text-primary">{item.label}</h4>
        <p className="mt-0.5 text-xs text-text-muted">{item.description}</p>
      </div>
      <div className="space-y-1.5">
        {rows.map((row, i) => {
          const s = STATUS_COLORS[row.status];
          return (
            <div
              key={i}
              className={cn(
                'flex items-center gap-2.5 rounded-lg border px-3 py-2',
                row.isProspect
                  ? 'border-accent/30 bg-accent/5'
                  : 'border-nativz-border/60 bg-background/50',
              )}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  row.isProspect ? 'font-medium text-text-primary' : 'text-text-secondary',
                )}
              >
                {row.label}
              </span>
              <span className={`shrink-0 text-xs font-medium ${s.text}`}>{row.value}</span>
            </div>
          );
        })}
      </div>
      {item.status_reason && (
        <p className="text-xs italic text-text-muted leading-relaxed">{item.status_reason}</p>
      )}
    </div>
  );
}

type ChartMetric = 'views' | 'er' | 'likes' | 'comments';
const METRIC_OPTIONS: { key: ChartMetric; label: string; format: (v: number) => string }[] = [
  { key: 'views', label: 'Views', format: (v) => formatNumber(v) },
  { key: 'er', label: 'Engagement', format: (v) => `${v.toFixed(2)}%` },
  { key: 'likes', label: 'Likes', format: (v) => formatNumber(v) },
  { key: 'comments', label: 'Comments', format: (v) => formatNumber(v) },
];

function DailyPerformanceChart({
  data,
  platform,
  color,
}: {
  data: { date: string; dayMs: number; views: number; likes: number; comments: number; er: number; isReal: boolean }[];
  platform: string;
  color: string;
}) {
  const [metric, setMetric] = useState<ChartMetric>('views');
  const opt = METRIC_OPTIONS.find((o) => o.key === metric) ?? METRIC_OPTIONS[0];

  const hasEngagement = data.some((d) => d.er > 0);
  const availableMetrics = hasEngagement
    ? METRIC_OPTIONS
    : METRIC_OPTIONS.filter((o) => o.key !== 'er');

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h4 className="text-sm font-semibold text-text-primary">Performance over time</h4>
        <div className="flex rounded-lg border border-nativz-border p-0.5">
          {availableMetrics.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setMetric(o.key)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                metric === o.key
                  ? 'bg-accent-surface text-accent-text'
                  : 'text-text-muted hover:text-text-secondary',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id={`perfGrad-${platform}-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--nativz-border)" />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => opt.format(v)}
              width={60}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--nativz-border)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number | undefined) => [opt.format(value ?? 0), opt.label]}
              labelFormatter={(label) => String(label)}
            />
            <Area
              type="monotone"
              dataKey={metric}
              stroke={color}
              fillOpacity={1}
              fill={`url(#perfGrad-${platform}-${metric})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: color, stroke: 'var(--surface)', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-text-muted">
        Solid dots = real post data · interpolated line fills gaps between posting days
      </p>
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
 * Unified brand overview. Stacks the prospect on top + each unique
 * competitor under "Benchmarked against:". Each row carries TT/IG/YT
 * badges that link out to the brand's profile on that platform — the
 * reader gets one card with everyone in the comparison and can jump
 * directly to any of their socials.
 *
 * Competitors live in `competitors` as one entry per (brand, platform).
 * We group by displayName so a brand that we found on both TikTok and
 * Instagram renders as one row with two active badges.
 */
function BrandOverviewCard({
  websiteContext,
  platforms,
  competitors,
}: {
  websiteContext: WebsiteContext | null;
  platforms: PlatformReport[];
  competitors: CompetitorProfile[];
}) {
  const ALL_PLATFORMS: AuditPlatformKey[] = ['tiktok', 'instagram', 'youtube'];
  const prospectPlatformSet = new Set(platforms.map((p) => p.platform));
  const prospectProfileUrlByPlatform = new Map(
    platforms.map((p) => [p.platform, p.profile.profileUrl] as const),
  );

  const competitorGroups = useMemo(() => {
    const map = new Map<string, CompetitorProfile[]>();
    for (const c of competitors) {
      const key = c.displayName.trim().toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.values());
  }, [competitors]);

  function renderPlatformBadges(
    presentSet: Set<string>,
    urlByPlatform: Map<string, string>,
  ) {
    return (
      <div className="flex items-center gap-1.5">
        {ALL_PLATFORMS.map((p) => {
          const present = presentSet.has(p);
          const url = urlByPlatform.get(p);
          if (!present || !url) {
            return (
              <span
                key={p}
                title={`No ${PLATFORM_LABELS[p]} profile found`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-nativz-border/40 bg-background/40 opacity-30"
              >
                <AuditPlatformIcon platform={p} size="sm" />
              </span>
            );
          }
          return (
            <a
              key={p}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open on ${PLATFORM_LABELS[p]}`}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-nativz-border bg-background transition-colors hover:border-accent/40 hover:bg-surface-hover"
            >
              <AuditPlatformIcon platform={p} size="sm" />
            </a>
          );
        })}
      </div>
    );
  }

  const prospectName = websiteContext?.title?.trim() || 'Your brand';
  const prospectAvatar = platforms[0]?.profile.avatarUrl ?? null;

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-6">
      {/* Prospect row */}
      <div className="flex items-start gap-4">
        <AvatarWithFallback
          src={prospectAvatar}
          name={prospectName}
          className="h-14 w-14 text-base"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold text-text-primary truncate">{prospectName}</h3>
            {websiteContext?.industry && (
              <span className="text-xs bg-accent-surface/30 text-white px-2.5 py-0.5 rounded-full">
                {websiteContext.industry}
              </span>
            )}
          </div>
          {websiteContext?.description && (
            <p className="mt-1.5 text-sm font-light leading-relaxed text-text-secondary line-clamp-3">
              {websiteContext.description}
            </p>
          )}
        </div>
        {renderPlatformBadges(prospectPlatformSet, prospectProfileUrlByPlatform)}
      </div>

      {/* Competitor rows */}
      {competitorGroups.length > 0 && (
        <>
          <div className="mt-5 mb-3 flex items-center gap-2">
            <span className="h-px flex-1 bg-nativz-border/60" />
            <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Benchmarked against
            </span>
            <span className="h-px flex-1 bg-nativz-border/60" />
          </div>
          <div className="space-y-2.5">
            {competitorGroups.map((group) => {
              const first = group[0];
              const presentSet = new Set(group.map((c) => c.platform));
              const urlByPlatform = new Map(group.map((c) => [c.platform, c.profileUrl] as const));
              const totalFollowers = group.reduce((sum, c) => sum + (c.isStub ? 0 : c.followers), 0);
              const allStub = group.every((c) => c.isStub);
              return (
                <div
                  key={first.displayName}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border bg-background/50 p-3',
                    allStub ? 'border-nativz-border/40 opacity-70' : 'border-nativz-border/70',
                  )}
                >
                  <AvatarWithFallback
                    src={first.avatarUrl}
                    name={first.displayName}
                    className="h-10 w-10 text-xs"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">{first.displayName}</p>
                    <p className="truncate text-xs text-text-muted">
                      {allStub
                        ? 'Data unavailable'
                        : `${formatNumber(totalFollowers)} followers · ${group.length} platform${group.length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  {renderPlatformBadges(presentSet, urlByPlatform)}
                </div>
              );
            })}
          </div>
        </>
      )}
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
  // Initial platform-based guess — replaced with the image's actual natural
  // aspect once it loads so 16:9 thumbnails render 16:9, 9:16 renders 9:16,
  // and square IG feed posts render 1:1 instead of being cropped.
  const initiallyVertical =
    platform === 'tiktok' ||
    platform === 'instagram' ||
    (platform === 'youtube' && duration != null && duration <= 60);
  type AspectClass = 'aspect-[9/16]' | 'aspect-video' | 'aspect-square';
  const [aspectClass, setAspectClass] = useState<AspectClass>(
    initiallyVertical ? 'aspect-[9/16]' : 'aspect-video',
  );

  if (!src || failed) {
    // Platform-tinted fallback so a row of missing thumbnails reads as a
    // readable grid (TikTok pink, IG magenta, YouTube red) rather than a
    // wall of grey eye icons. Triggered when the scraper didn't return a
    // thumbnailUrl OR the persisted Storage URL 404s.
    const tint = PLATFORM_COLORS[platform] ?? 'var(--accent)';
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden ${aspectClass}`}
        style={{
          background: `radial-gradient(circle at 30% 30%, ${tint}33, ${tint}11 60%, var(--surface-hover) 100%)`,
        }}
      >
        <span className="opacity-50">
          {platform === 'tiktok' ? <TikTokMark size={28} /> : null}
          {platform === 'instagram' ? <InstagramMark variant="full" size={28} /> : null}
          {platform === 'youtube' ? <YouTubeMark variant="full" size={28} /> : null}
          {platform !== 'tiktok' && platform !== 'instagram' && platform !== 'youtube' ? (
            <Eye size={20} className="text-text-muted/40" />
          ) : null}
        </span>
      </div>
    );
  }

  function onLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) return;
    const ratio = w / h;
    if (ratio < 0.85) setAspectClass('aspect-[9/16]');
    else if (ratio > 1.15) setAspectClass('aspect-video');
    else setAspectClass('aspect-square');
  }

  return (
    <div className={`bg-surface-hover overflow-hidden ${aspectClass}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onLoad={onLoad}
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

// ─── Competitor comparison table ─────────────────────────────────────────

interface ComparisonRow {
  label: string;
  format: (value: number) => string;
  higherIsBetter: boolean;
  values: Record<string, number>;
}

/**
 * Side-by-side metric comparison between the target's active platform and
 * each competitor on the same platform. Each row is a metric; the winning
 * cell gets a trophy icon + green tint. Missing data shows an em-dash.
 */
function CompetitorComparisonTable({
  activePlatform,
  competitors,
}: {
  activePlatform: PlatformReport | undefined;
  competitors: CompetitorProfile[];
}) {
  if (!activePlatform || competitors.length === 0) return null;

  const samePlatformCompetitors = competitors.filter(
    (c) => c.platform === activePlatform.platform,
  );
  if (samePlatformCompetitors.length === 0) return null;

  const targetCol = {
    id: 'target' as const,
    name: activePlatform.profile.displayName || activePlatform.profile.username,
    username: activePlatform.profile.username,
    avatarUrl: activePlatform.profile.avatarUrl,
    isTarget: true,
  };
  const competitorCols = samePlatformCompetitors.map((c) => ({
    id: c.username,
    name: c.displayName || c.username,
    username: c.username,
    avatarUrl: c.avatarUrl,
    isTarget: false,
  }));
  const allCols = [targetCol, ...competitorCols];

  const avgHashtagsTarget =
    activePlatform.videos.length > 0
      ? activePlatform.videos.reduce((sum, v) => sum + v.hashtags.length, 0) /
        activePlatform.videos.length
      : 0;
  const avgHashtagsFor = (c: CompetitorProfile) =>
    c.recentVideos.length > 0
      ? c.recentVideos.reduce((sum, v) => sum + v.hashtags.length, 0) / c.recentVideos.length
      : 0;

  const rows: ComparisonRow[] = [
    {
      label: 'Followers',
      format: formatNumber,
      higherIsBetter: true,
      values: {
        target: activePlatform.profile.followers,
        ...Object.fromEntries(samePlatformCompetitors.map((c) => [c.username, c.followers])),
      },
    },
    {
      label: 'Average views',
      format: formatNumber,
      higherIsBetter: true,
      values: {
        target: activePlatform.avgViews,
        ...Object.fromEntries(samePlatformCompetitors.map((c) => [c.username, c.avgViews])),
      },
    },
    {
      label: 'Engagement rate',
      format: (v) => `${(v * 100).toFixed(2)}%`,
      higherIsBetter: true,
      values: {
        target: activePlatform.engagementRate,
        ...Object.fromEntries(
          samePlatformCompetitors.map((c) => [c.username, c.engagementRate]),
        ),
      },
    },
    {
      label: 'Avg hashtags per post',
      format: (v) => v.toFixed(1),
      higherIsBetter: true,
      values: {
        target: avgHashtagsTarget,
        ...Object.fromEntries(
          samePlatformCompetitors.map((c) => [c.username, avgHashtagsFor(c)]),
        ),
      },
    },
    {
      label: 'Posts sampled',
      format: (v) => v.toFixed(0),
      higherIsBetter: true,
      values: {
        target: activePlatform.videos.length,
        ...Object.fromEntries(
          samePlatformCompetitors.map((c) => [c.username, c.recentVideos.length]),
        ),
      },
    },
  ];

  const winnerByRow = new Map<string, string>();
  for (const row of rows) {
    const entries = Object.entries(row.values).filter(([, v]) => typeof v === 'number' && !Number.isNaN(v));
    if (entries.length === 0) continue;
    const sorted = [...entries].sort((a, b) =>
      row.higherIsBetter ? b[1] - a[1] : a[1] - b[1],
    );
    winnerByRow.set(row.label, sorted[0][0]);
  }

  const winsByCol = new Map<string, number>();
  for (const winnerId of winnerByRow.values()) {
    winsByCol.set(winnerId, (winsByCol.get(winnerId) ?? 0) + 1);
  }

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h3 className="text-base font-semibold text-text-primary">
            Head-to-head comparison
          </h3>
          <p className="mt-0.5 text-xs text-text-muted">
            {activePlatform.profile.displayName || 'You'} vs.{' '}
            {samePlatformCompetitors.length} competitor
            {samePlatformCompetitors.length === 1 ? '' : 's'} on {activePlatform.platform}
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                Metric
              </th>
              {allCols.map((col) => {
                const wins = winsByCol.get(col.id) ?? 0;
                return (
                  <th
                    key={col.id}
                    className={`min-w-[160px] border-l border-nativz-border px-3 py-3 text-left ${
                      col.isTarget ? 'bg-accent-surface/15' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <AvatarWithFallback
                        src={col.avatarUrl}
                        name={col.name}
                        className="h-8 w-8 text-[10px]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-text-primary">
                          {col.name}
                        </p>
                        <p className="truncate text-[10px] text-text-muted">
                          @{String(col.username).replace(/^@+/, '')}
                          {col.isTarget ? ' · You' : ''}
                          {wins > 0 ? ` · ${wins} ${wins === 1 ? 'win' : 'wins'}` : ''}
                        </p>
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const winnerId = winnerByRow.get(row.label);
              return (
                <tr key={row.label} className="border-t border-nativz-border/60">
                  <td className="sticky left-0 z-10 bg-surface px-3 py-3 text-xs font-medium text-text-muted">
                    {row.label}
                  </td>
                  {allCols.map((col) => {
                    const raw = row.values[col.id];
                    const isWinner = winnerId === col.id;
                    return (
                      <td
                        key={col.id}
                        className={`border-l border-nativz-border px-3 py-3 ${
                          col.isTarget ? 'bg-accent-surface/[0.06]' : ''
                        } ${isWinner ? 'bg-emerald-500/[0.08]' : ''}`}
                      >
                        {typeof raw === 'number' && !Number.isNaN(raw) ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-sm font-semibold ${
                                isWinner ? 'text-emerald-400' : 'text-text-primary'
                              }`}
                            >
                              {row.format(raw)}
                            </span>
                            {isWinner && (
                              <CheckCircle
                                size={13}
                                className="shrink-0 text-emerald-400"
                                aria-label="Winner"
                              />
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-text-muted">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
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
