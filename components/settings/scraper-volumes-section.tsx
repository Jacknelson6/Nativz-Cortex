'use client';

/**
 * Admin volume + cost editor for topic-search scrapers.
 *
 * Writes to the singleton `scraper_settings` row (id=1); the platform
 * router reads those values on every topic search. Numbers here are the
 * SINGLE source of truth for per-platform counts — there are no
 * deep/medium/shallow presets (Jack's policy, 2026-04-23).
 *
 * Layout:
 *   • Left column: platform sections (Reddit / YouTube / TikTok / Web),
 *     each with its own heading, icon, and grouped number inputs.
 *   • Right column: estimated $/search sidecar using PER_UNIT_COST_USD
 *     measurements from real Apify runs on 2026-04-23.
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Globe, Loader2, MessageCircle, Music, Save, Youtube } from 'lucide-react';
import { PER_UNIT_COST_USD } from '@/lib/search/scraper-cost-constants';

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
  hint?: string;
  /** Primary fields drive cost; shown with a $/unit tag next to the input. */
  isPrimary: boolean;
}

interface PlatformSection {
  platform: PlatformKey;
  title: string;
  icon: typeof Globe;
  accentClass: string;
  /** Sentence explaining what this platform contributes. */
  blurb: string;
  fields: PlatformField[];
}

/**
 * Ordered per-platform field config. Headings + icons render in this order
 * on screen. Reorder here to reorder the UI — no other files need changes.
 */
const PLATFORM_SECTIONS: readonly PlatformSection[] = [
  {
    platform: 'reddit',
    title: 'Reddit',
    icon: MessageCircle,
    accentClass: 'text-[#FF4500]',
    blurb: 'Macrocosmos + trudax via Apify. Cheap, high-signal for discussion topics.',
    fields: [
      {
        key: 'reddit_posts',
        label: 'Posts per search',
        hint: 'Total posts across the whole search (not per subtopic). 0 skips Reddit entirely.',
        isPrimary: true,
      },
      {
        key: 'reddit_comments_per_post',
        label: 'Comments per post',
        hint: 'Comments bundle into the same dataset rows (no extra Apify run).',
        isPrimary: false,
      },
    ],
  },
  {
    platform: 'youtube',
    title: 'YouTube',
    icon: Youtube,
    accentClass: 'text-[#FF0000]',
    blurb: 'Official YouTube Data API. 10K/day free quota; transcripts are free.',
    fields: [
      {
        key: 'youtube_videos',
        label: 'Videos per search',
        hint: 'Metadata + stats for this many top videos.',
        isPrimary: true,
      },
      {
        key: 'youtube_comment_videos',
        label: 'Videos we pull comments for',
        hint: 'Top-by-views subset of the above.',
        isPrimary: false,
      },
      {
        key: 'youtube_transcript_videos',
        label: 'Videos we transcribe',
        hint: 'Free via youtube-transcript — high-signal for merger context.',
        isPrimary: false,
      },
    ],
  },
  {
    platform: 'tiktok',
    title: 'TikTok',
    icon: Music,
    accentClass: 'text-text-primary',
    blurb: 'apidojo/tiktok-scraper via Apify. Comments via tikwm; captions → Whisper.',
    fields: [
      {
        key: 'tiktok_videos',
        label: 'Videos per search',
        hint: 'Total TikTok videos pulled (cap applies before ranking).',
        isPrimary: true,
      },
      {
        key: 'tiktok_comment_videos',
        label: 'Videos we pull comments for',
        hint: 'Top-by-engagement subset.',
        isPrimary: false,
      },
      {
        key: 'tiktok_transcript_videos',
        label: 'Videos we transcribe',
        hint: 'Captions first; Groq Whisper fallback only when missing.',
        isPrimary: false,
      },
    ],
  },
  {
    platform: 'web',
    title: 'Web',
    icon: Globe,
    accentClass: 'text-blue-400',
    blurb: 'Google SERP via Apify scraperlink + Serper for "People Also Ask".',
    fields: [
      {
        key: 'web_results',
        label: 'Google results per search',
        hint: 'Feeds both web-source extraction and PAA question mining.',
        isPrimary: true,
      },
    ],
  },
];

// ── UI helpers ──────────────────────────────────────────────────────────

function formatUsd(n: number): string {
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

function primaryFieldForPlatform(platform: PlatformKey): keyof SettingsRow {
  return PLATFORM_SECTIONS.find((s) => s.platform === platform)!.fields.find((f) => f.isPrimary)!
    .key;
}

function clampInt(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5000, n));
}

// ── Main component ──────────────────────────────────────────────────────

export function ScraperVolumesSection() {
  const [row, setRow] = useState<SettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/scraper-settings');
        if (!res.ok) throw new Error(`status ${res.status}`);
        const j = await res.json();
        setRow(j.settings);
      } catch (err) {
        toast.error(`Failed to load volumes: ${(err as Error).message}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const perPlatformCost = useMemo<Record<PlatformKey, number> | null>(() => {
    if (!row) return null;
    return {
      reddit: row.reddit_posts * PER_UNIT_COST_USD.reddit,
      youtube: row.youtube_videos * PER_UNIT_COST_USD.youtube,
      tiktok: row.tiktok_videos * PER_UNIT_COST_USD.tiktok,
      web: row.web_results * PER_UNIT_COST_USD.web,
    };
  }, [row]);

  const totalCost = perPlatformCost
    ? Object.values(perPlatformCost).reduce((a, b) => a + b, 0)
    : 0;

  async function save() {
    if (!row) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/scraper-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `status ${res.status}`);
      }
      toast.success('Volumes saved');
    } catch (err) {
      toast.error(`Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

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
    <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
      {/* Left column — per-platform sections */}
      <div className="space-y-4">
        {PLATFORM_SECTIONS.map((section) => (
          <PlatformCard
            key={section.platform}
            section={section}
            row={row}
            onChange={(key, value) =>
              setRow((prev) => (prev ? { ...prev, [key]: value } : prev))
            }
          />
        ))}

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-3 py-1.5 text-sm font-medium text-accent-text transition-colors hover:border-accent/70 hover:bg-accent/25 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save volumes'}
          </button>
        </div>
      </div>

      {/* Right column — cost sidecar */}
      <div className="min-w-[260px] rounded-xl border border-accent/25 bg-accent/5 p-5 lg:sticky lg:top-4 lg:self-start">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-accent-text">
          Est. cost / search
        </h3>
        <p className="mt-3 text-3xl font-semibold tabular-nums text-text-primary">
          {formatUsd(totalCost)}
        </p>
        <p className="mt-1 text-[11px] text-text-muted">
          Based on observed Apify per-unit pricing on 2026-04-23.
        </p>

        <div className="mt-5 space-y-2 text-xs">
          {perPlatformCost
            ? (Object.entries(perPlatformCost) as [PlatformKey, number][]).map(([k, v]) => {
                const primary = primaryFieldForPlatform(k);
                const count = row[primary];
                return (
                  <div key={k} className="flex items-center justify-between">
                    <span className="capitalize text-text-muted">
                      {k} <span className="text-text-muted/60">({count})</span>
                    </span>
                    <span className="tabular-nums text-text-secondary">
                      {PER_UNIT_COST_USD[k] === 0 ? 'free' : formatUsd(v)}
                    </span>
                  </div>
                );
              })
            : null}
        </div>

        <p className="mt-5 text-[11px] leading-snug text-text-muted">
          Actual charges land in the{' '}
          <code className="rounded bg-background/60 px-1">apify_runs</code> table per run — use
          it for real billing.
        </p>
      </div>
    </div>
  );
}

// ── Platform card ───────────────────────────────────────────────────────

function PlatformCard({
  section,
  row,
  onChange,
}: {
  section: PlatformSection;
  row: SettingsRow;
  onChange: (key: keyof SettingsRow, value: number) => void;
}) {
  const Icon = section.icon;
  const perUnit = PER_UNIT_COST_USD[section.platform];

  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg bg-background/60 ${section.accentClass}`}
          >
            <Icon size={16} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{section.title}</h3>
            <p className="text-[11px] leading-snug text-text-muted">{section.blurb}</p>
          </div>
        </div>
        {perUnit > 0 ? (
          <span className="shrink-0 rounded-md border border-nativz-border-light bg-background/40 px-2 py-0.5 text-[10px] font-medium tabular-nums text-text-muted">
            ≈ ${perUnit.toFixed(4)}/unit
          </span>
        ) : (
          <span className="shrink-0 rounded-md border border-nativz-border-light bg-background/40 px-2 py-0.5 text-[10px] font-medium text-text-muted">
            free
          </span>
        )}
      </header>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {section.fields.map((field) => (
          <VolumeInput
            key={field.key}
            label={field.label}
            hint={field.hint}
            value={row[field.key]}
            step={field.isPrimary ? 10 : 1}
            trailing={
              field.isPrimary && perUnit > 0
                ? `≈ ${formatUsd(row[field.key] * perUnit)}`
                : field.isPrimary
                  ? 'free'
                  : undefined
            }
            onChange={(n) => onChange(field.key, n)}
          />
        ))}
      </div>
    </section>
  );
}

function VolumeInput({
  label,
  hint,
  value,
  step,
  trailing,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  step: number;
  trailing?: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 rounded-lg border border-nativz-border-light bg-background/40 p-3">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={5000}
          step={step}
          value={value}
          onChange={(e) => onChange(clampInt(e.target.value))}
          className="w-24 rounded-md border border-nativz-border bg-background px-2 py-1 text-sm text-text-primary tabular-nums focus:border-accent focus:outline-none"
        />
        {trailing ? (
          <span className="text-[11px] tabular-nums text-text-muted">{trailing}</span>
        ) : null}
      </div>
      {hint ? <span className="text-[11px] leading-snug text-text-muted">{hint}</span> : null}
    </label>
  );
}
