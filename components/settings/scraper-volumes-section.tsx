'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { PER_UNIT_COST_USD } from '@/lib/search/scraper-cost-constants';

/**
 * Admin volume + cost editor. Fields write to `scraper_settings` (singleton
 * row); the platform router reads them on every topic search. The right
 * column shows an estimated $/search derived from `PER_UNIT_COST_USD`.
 */

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
  quora_threads: number;
}

const PLATFORM_ROWS: Array<{
  key: keyof SettingsRow;
  label: string;
  platform: 'reddit' | 'youtube' | 'tiktok' | 'web' | 'quora';
  isPrimary: boolean;
  hint?: string;
}> = [
  { key: 'reddit_posts',               label: 'Reddit — posts per search',         platform: 'reddit',  isPrimary: true,  hint: 'Cost driver for Reddit runs.' },
  { key: 'reddit_comments_per_post',   label: 'Reddit — comments per post',        platform: 'reddit',  isPrimary: false, hint: 'Comments bundle into the same dataset rows.' },
  { key: 'youtube_videos',             label: 'YouTube — videos per search',       platform: 'youtube', isPrimary: true },
  { key: 'youtube_comment_videos',     label: 'YouTube — videos we pull comments for', platform: 'youtube', isPrimary: false },
  { key: 'youtube_transcript_videos',  label: 'YouTube — videos we transcribe',    platform: 'youtube', isPrimary: false },
  { key: 'tiktok_videos',              label: 'TikTok — videos per search',        platform: 'tiktok',  isPrimary: true },
  { key: 'tiktok_comment_videos',      label: 'TikTok — videos we pull comments for',   platform: 'tiktok', isPrimary: false },
  { key: 'tiktok_transcript_videos',   label: 'TikTok — videos we transcribe',     platform: 'tiktok',  isPrimary: false },
  { key: 'web_results',                label: 'Google web results per search',     platform: 'web',     isPrimary: true },
  { key: 'quora_threads',              label: 'Quora — threads per search',        platform: 'quora',   isPrimary: true },
];

function formatUsd(n: number): string {
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

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

  const perPlatformCost = useMemo(() => {
    if (!row) return null;
    return {
      reddit: row.reddit_posts * PER_UNIT_COST_USD.reddit,
      youtube: row.youtube_videos * PER_UNIT_COST_USD.youtube,
      tiktok: row.tiktok_videos * PER_UNIT_COST_USD.tiktok,
      web: row.web_results * PER_UNIT_COST_USD.web,
      quora: row.quora_threads * PER_UNIT_COST_USD.quora,
    } as const;
  }, [row]);

  const totalCost = perPlatformCost ? Object.values(perPlatformCost).reduce((a, b) => a + b, 0) : 0;

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
      {/* Left: editable inputs */}
      <div className="rounded-xl border border-nativz-border bg-surface p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PLATFORM_ROWS.map(({ key, label, platform, isPrimary, hint }) => (
            <label
              key={key}
              className="flex flex-col gap-1.5 rounded-lg border border-nativz-border-light bg-background/40 p-3"
            >
              <span className="text-xs font-medium text-text-secondary">{label}</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={5000}
                  step={isPrimary ? 10 : 1}
                  value={row[key]}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(5000, Number.parseInt(e.target.value, 10) || 0));
                    setRow((prev) => (prev ? { ...prev, [key]: v } : prev));
                  }}
                  className="w-24 rounded-md border border-nativz-border bg-background px-2 py-1 text-sm text-text-primary tabular-nums focus:border-accent focus:outline-none"
                />
                {isPrimary && PER_UNIT_COST_USD[platform] > 0 ? (
                  <span className="text-[11px] tabular-nums text-text-muted">
                    ≈ {formatUsd(row[key] * PER_UNIT_COST_USD[platform])}
                  </span>
                ) : isPrimary ? (
                  <span className="text-[11px] text-text-muted">free</span>
                ) : null}
              </div>
              {hint ? <span className="text-[11px] leading-snug text-text-muted">{hint}</span> : null}
            </label>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
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

      {/* Right: estimated cost per search */}
      <div className="min-w-[260px] rounded-xl border border-accent/25 bg-accent/5 p-5">
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
          {perPlatformCost ? (
            Object.entries(perPlatformCost).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <span className="capitalize text-text-muted">{k}</span>
                <span className="tabular-nums text-text-secondary">{formatUsd(v)}</span>
              </div>
            ))
          ) : null}
        </div>

        <p className="mt-5 text-[11px] leading-snug text-text-muted">
          Actual charges land in the <code className="rounded bg-background/60 px-1">apify_runs</code> table per run — use it for real billing.
        </p>
      </div>
    </div>
  );
}
