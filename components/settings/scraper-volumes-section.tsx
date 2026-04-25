'use client';

/**
 * Admin volume + cost editor for topic-search scrapers.
 *
 * Writes to the singleton `scraper_settings` row (id=1) on every change —
 * debounced autosave replaces the old "Save volumes" button. Per-unit
 * pricing comes from `scraper_unit_prices` (populated by the refresh
 * endpoint from real apify_runs data) with a manual refresh control.
 *
 * Layout: 4 equal-width platform cards, a cost-breakdown pie, and a
 * per-unit pricing strip. Subtext moved to hover tooltips per Jack's ask
 * on 2026-04-24 — keeps the surface quieter.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2 } from 'lucide-react';
import { PER_UNIT_COST_USD } from '@/lib/search/scraper-cost-constants';
import { PLATFORM_CONFIG } from '@/components/search/platform-icon';
import { TooltipCard } from '@/components/ui/tooltip-card';

interface SettingsRow {
  reddit_posts: number;
  reddit_comments_per_post: number;
  youtube_videos: number;
  youtube_comment_videos: number;
  youtube_transcript_videos: number;
  tiktok_videos: number;
  tiktok_comment_videos: number;
  tiktok_transcript_videos: number;
  web_results: number;
}

type PlatformKey = 'reddit' | 'youtube' | 'tiktok' | 'web';

interface PlatformField {
  key: keyof SettingsRow;
  label: string;
  tooltip: string;
  isPrimary: boolean;
  /** Slider ceiling — primary fields sweep a wider range than secondary. */
  max: number;
  step: number;
}

interface PlatformSection {
  platform: PlatformKey;
  title: string;
  /** Hover explainer on the card header. Replaces the old `blurb` subtext. */
  tooltip: string;
  fields: PlatformField[];
}

const PLATFORM_SECTIONS: readonly PlatformSection[] = [
  {
    platform: 'reddit',
    title: 'Reddit',
    tooltip:
      'Macrocosmos + trudax via Apify. Cheap, high-signal for discussion topics. Comments bundle into the same dataset rows (no extra Apify run).',
    fields: [
      {
        key: 'reddit_posts',
        label: 'Posts per search',
        tooltip: 'Total posts across the whole search (not per subtopic). 0 skips Reddit entirely.',
        isPrimary: true,
        max: 500,
        step: 10,
      },
      {
        key: 'reddit_comments_per_post',
        label: 'Comments per post',
        tooltip: 'Comments bundle into the same dataset rows — no extra Apify run.',
        isPrimary: false,
        max: 100,
        step: 5,
      },
    ],
  },
  {
    platform: 'youtube',
    title: 'YouTube',
    tooltip: 'Official YouTube Data API. 10K/day free quota. Transcripts are free via youtube-transcript.',
    fields: [
      {
        key: 'youtube_videos',
        label: 'Videos per search',
        tooltip: 'Metadata + stats for this many top videos.',
        isPrimary: true,
        max: 500,
        step: 10,
      },
      {
        key: 'youtube_comment_videos',
        label: 'Videos we pull comments for',
        tooltip: 'Top-by-views subset of the above.',
        isPrimary: false,
        max: 100,
        step: 5,
      },
      {
        key: 'youtube_transcript_videos',
        label: 'Videos we transcribe',
        tooltip: 'Free via youtube-transcript — high-signal for merger context.',
        isPrimary: false,
        max: 100,
        step: 5,
      },
    ],
  },
  {
    platform: 'tiktok',
    title: 'TikTok',
    tooltip:
      'apidojo/tiktok-scraper via Apify. Comments via tikwm; captions first, Groq Whisper fallback only when missing.',
    fields: [
      {
        key: 'tiktok_videos',
        label: 'Videos per search',
        tooltip: 'Total TikTok videos pulled (cap applies before ranking).',
        isPrimary: true,
        max: 500,
        step: 10,
      },
      {
        key: 'tiktok_comment_videos',
        label: 'Videos we pull comments for',
        tooltip: 'Top-by-engagement subset.',
        isPrimary: false,
        max: 100,
        step: 5,
      },
      {
        key: 'tiktok_transcript_videos',
        label: 'Videos we transcribe',
        tooltip: 'Captions first; Groq Whisper fallback only when missing.',
        isPrimary: false,
        max: 100,
        step: 5,
      },
    ],
  },
  {
    platform: 'web',
    title: 'Web',
    tooltip: 'Google SERP via Apify scraperlink + Serper for "People Also Ask".',
    fields: [
      {
        key: 'web_results',
        label: 'Google results per search',
        tooltip: 'Feeds both web-source extraction and PAA question mining.',
        isPrimary: true,
        max: 100,
        step: 5,
      },
    ],
  },
];

interface UnitPricesResp {
  reddit: number;
  youtube: number;
  tiktok: number;
  web: number;
  refreshedAt: string | null;
  source?: Record<string, { actor: string; runs: number; source: string; price: number }> | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function formatUsd(n: number): string {
  if (n === 0) return 'free';
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

function formatUnitPrice(n: number): string {
  if (n === 0) return 'free';
  return `$${n.toFixed(4)}`;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const delta = Date.now() - new Date(iso).getTime();
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  return `${Math.round(delta / 86_400_000)}d ago`;
}

function primaryFieldForPlatform(platform: PlatformKey): keyof SettingsRow {
  return PLATFORM_SECTIONS.find((s) => s.platform === platform)!.fields.find((f) => f.isPrimary)!
    .key;
}

function clampInt(raw: string | number): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5000, n));
}

// Platform palette — muted brand-adjacent hues so the donut reads as a
// professional data viz rather than a saturated social-media mosaic. Same
// map drives legend swatches so donut + side-list never drift.
const PIE_COLORS: Record<PlatformKey, string> = {
  reddit: '#EA580C',  // orange-600
  youtube: '#DC2626', // red-600
  tiktok: '#7C3AED',  // violet-600
  web: '#2563EB',     // blue-600
};

// ── Main component ──────────────────────────────────────────────────────

export function ScraperVolumesSection() {
  const [row, setRow] = useState<SettingsRow | null>(null);
  const [prices, setPrices] = useState<UnitPricesResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<SettingsRow | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/scraper-settings');
        if (!res.ok) throw new Error(`status ${res.status}`);
        const j = await res.json();
        setRow(j.settings);
        lastSavedRef.current = j.settings;
        setPrices(j.prices);
      } catch (err) {
        toast.error(`Failed to load volumes: ${(err as Error).message}`);
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
    };
  }, []);

  const unitPrice = useCallback(
    (platform: PlatformKey): number => {
      if (prices) return prices[platform];
      return PER_UNIT_COST_USD[platform];
    },
    [prices],
  );

  const perPlatformCost = useMemo<Record<PlatformKey, number> | null>(() => {
    if (!row) return null;
    return {
      reddit: row.reddit_posts * unitPrice('reddit'),
      youtube: row.youtube_videos * unitPrice('youtube'),
      tiktok: row.tiktok_videos * unitPrice('tiktok'),
      web: row.web_results * unitPrice('web'),
    };
  }, [row, unitPrice]);

  const totalCost = perPlatformCost
    ? Object.values(perPlatformCost).reduce((a, b) => a + b, 0)
    : 0;

  // Debounced autosave — fires 600ms after the last change. Manual state
  // transitions idle → saving → saved (brief flash) → idle so the user
  // sees a clear acknowledgment without chart thrash.
  const scheduleSave = useCallback((next: SettingsRow) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const prev = lastSavedRef.current;
      setSaveState('saving');
      try {
        const res = await fetch('/api/admin/scraper-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `status ${res.status}`);
        }
        lastSavedRef.current = next;
        setSaveState('saved');
        if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
        savedFlashTimer.current = setTimeout(() => setSaveState('idle'), 1500);
      } catch (err) {
        toast.error(`Save failed: ${(err as Error).message}`);
        if (prev) setRow(prev);
        setSaveState('idle');
      }
    }, 600);
  }, []);

  const handleFieldChange = useCallback(
    (key: keyof SettingsRow, value: number) => {
      setRow((prev) => {
        if (!prev) return prev;
        const next = { ...prev, [key]: value };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-nativz-border bg-surface px-4 py-6 text-sm text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading volumes…
      </div>
    );
  }

  if (!row) {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface px-4 py-6 text-sm text-text-muted">
        Couldn&apos;t load volume settings.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLATFORM_SECTIONS.map((section) => (
          <PlatformCard
            key={section.platform}
            section={section}
            row={row}
            unitPrice={unitPrice(section.platform)}
            onChange={handleFieldChange}
          />
        ))}
      </div>

      <CostSummaryBar
        perPlatformCost={perPlatformCost}
        totalCost={totalCost}
        row={row}
        pricesRefreshedAt={prices?.refreshedAt ?? null}
        saveState={saveState}
      />
    </div>
  );
}

// ── Cost summary ────────────────────────────────────────────────────────

/**
 * One-row cost readout: total + stacked horizontal bar + inline legend.
 * Replaced the prior two-card estimate/donut + per-unit strip — same info,
 * one quarter the vertical space, hierarchy that lets the sliders dominate.
 */
function CostSummaryBar({
  perPlatformCost,
  totalCost,
  row,
  pricesRefreshedAt,
  saveState,
}: {
  perPlatformCost: Record<PlatformKey, number> | null;
  totalCost: number;
  row: SettingsRow;
  pricesRefreshedAt: string | null;
  saveState: 'idle' | 'saving' | 'saved';
}) {
  const [activeKey, setActiveKey] = useState<PlatformKey | null>(null);

  const segments = useMemo(() => {
    if (!perPlatformCost) return [];
    return (Object.entries(perPlatformCost) as [PlatformKey, number][])
      .filter(([, v]) => v > 0)
      .map(([platform, value]) => ({
        platform,
        value,
        pct: totalCost > 0 ? (value / totalCost) * 100 : 0,
        count: row[primaryFieldForPlatform(platform)],
      }))
      .sort((a, b) => b.value - a.value);
  }, [perPlatformCost, totalCost, row]);

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Cost per search
          </span>
          <span className="text-2xl font-semibold tabular-nums text-text-primary">
            {formatUsd(totalCost)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-text-muted">
          <SaveStateBadge state={saveState} />
          <span>prices updated {formatRelativeTime(pricesRefreshedAt)}</span>
        </div>
      </div>

      {segments.length > 0 ? (
        <>
          <div
            className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-surface-hover/40"
            onMouseLeave={() => setActiveKey(null)}
          >
            {segments.map((seg) => (
              <div
                key={seg.platform}
                onMouseEnter={() => setActiveKey(seg.platform)}
                className="h-full transition-opacity duration-150"
                style={{
                  width: `${seg.pct}%`,
                  backgroundColor: PIE_COLORS[seg.platform],
                  opacity: activeKey == null || activeKey === seg.platform ? 1 : 0.35,
                }}
                title={`${PLATFORM_CONFIG[seg.platform].label}: ${formatUsd(seg.value)} (${seg.pct.toFixed(1)}%)`}
              />
            ))}
          </div>

          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px]">
            {segments.map((seg) => {
              const dim = activeKey != null && activeKey !== seg.platform;
              return (
                <li
                  key={seg.platform}
                  onMouseEnter={() => setActiveKey(seg.platform)}
                  onMouseLeave={() => setActiveKey(null)}
                  className={`flex items-center gap-2 transition-opacity ${
                    dim ? 'opacity-50' : 'opacity-100'
                  }`}
                >
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: PIE_COLORS[seg.platform] }}
                  />
                  <span className="text-text-secondary">
                    {PLATFORM_CONFIG[seg.platform].label}
                  </span>
                  <span className="text-text-muted">· {seg.count}</span>
                  <span className="tabular-nums text-text-primary">{formatUsd(seg.value)}</span>
                  <span className="tabular-nums text-text-muted/70">
                    · {seg.pct < 1 ? '<1%' : `${Math.round(seg.pct)}%`}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-sm text-text-muted">All platforms at zero — no scrape will run.</p>
      )}
    </div>
  );
}

// ── Save state indicator ────────────────────────────────────────────────

function SaveStateBadge({ state }: { state: 'idle' | 'saving' | 'saved' }) {
  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
        <Loader2 size={12} className="animate-spin" />
        Saving…
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
        <Check size={12} />
        Saved
      </span>
    );
  }
  return null;
}

// ── Platform card ───────────────────────────────────────────────────────

function PlatformCard({
  section,
  row,
  unitPrice,
  onChange,
}: {
  section: PlatformSection;
  row: SettingsRow;
  unitPrice: number;
  onChange: (key: keyof SettingsRow, value: number) => void;
}) {
  const config = PLATFORM_CONFIG[section.platform];
  const BrandIcon = config.icon;

  return (
    <section className="flex h-full flex-col rounded-xl border border-nativz-border bg-surface p-5 transition-colors hover:border-nativz-border-light">
      <header className="flex items-start justify-between gap-3">
        <TooltipCard title={section.title} description={section.tooltip} iconTrigger>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-nativz-border bg-surface-hover/70">
              <BrandIcon size={18} className="text-text-primary" />
            </span>
            <h3 className="cursor-help text-base font-semibold text-text-primary">
              {section.title}
            </h3>
          </div>
        </TooltipCard>
        <span className="shrink-0 rounded-md bg-background/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-text-muted">
          {formatUnitPrice(unitPrice)}/unit
        </span>
      </header>

      <div className="mt-4 space-y-4">
        {section.fields.map((field) => (
          <VolumeSlider
            key={field.key}
            label={field.label}
            tooltip={field.tooltip}
            value={row[field.key]}
            max={field.max}
            step={field.step}
            onChange={(n) => onChange(field.key, n)}
          />
        ))}
      </div>
    </section>
  );
}

function VolumeSlider({
  label,
  tooltip,
  value,
  max,
  step,
  onChange,
}: {
  label: string;
  tooltip: string;
  value: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  const clamped = Math.max(0, Math.min(max, value));
  const pct = max === 0 ? 0 : (clamped / max) * 100;

  return (
    <label className="block">
      <div className="flex items-baseline justify-between gap-2">
        <TooltipCard title={label} description={tooltip}>
          <span className="text-[13px] font-medium text-text-secondary">{label}</span>
        </TooltipCard>
        <span className="text-[13px] font-semibold tabular-nums text-text-primary">
          {clamped}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={clamped}
        onChange={(e) => onChange(clampInt(e.target.value))}
        className="volume-slider mt-2 w-full cursor-pointer appearance-none bg-transparent"
        style={{
          background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--color-surface-hover, rgba(255,255,255,0.08)) ${pct}%, var(--color-surface-hover, rgba(255,255,255,0.08)) 100%)`,
          height: '4px',
          borderRadius: '9999px',
        }}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={clamped}
      />
    </label>
  );
}
