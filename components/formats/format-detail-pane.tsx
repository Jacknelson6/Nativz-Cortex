'use client';

// VFF-09 T13: 12-col detail pane.
// Left 7 cols: platform iframe.
// Right 5 cols: header, action bar, why-it-works, format dimensions,
// retention pattern, audience reaction (collapsible), source link.

import { useState } from 'react';
import type { FormatDetailPayload } from '@/lib/analytics/format-detail';
import { FormatVideoPreview } from './format-video-preview';
import { FormatActionBar } from './format-action-bar';

const KIND_LABEL: Record<'hook_type' | 'structure' | 'archetype' | 'pacing', string> = {
  hook_type: 'Hook',
  structure: 'Structure',
  archetype: 'Archetype',
  pacing: 'Pacing',
};

type Props = {
  data: FormatDetailPayload;
  brand_name?: string | null;
};

export function FormatDetailPane({ data, brand_name = null }: Props) {
  const { video, brand_context } = data;
  const [commentsOpen, setCommentsOpen] = useState(false);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
      {/* Left: video preview */}
      <div className="md:col-span-7">
        <FormatVideoPreview
          platform={video.platform}
          source_url={video.source_url}
          external_post_id={video.external_post_id}
          fallback_thumbnail={video.thumbnail_storage_url ?? video.thumbnail_source_url}
        />
      </div>

      {/* Right: analysis */}
      <div className="space-y-4 md:col-span-5">
        <header className="space-y-1">
          <div className="flex items-baseline gap-2 text-xs text-white/60">
            <span>{video.creator_handle ? `@${video.creator_handle.replace(/^@/, '')}` : 'Unknown creator'}</span>
            {video.posted_at ? <span>· {relativeTime(video.posted_at)}</span> : null}
          </div>
          {brand_context?.competitor_match ? (
            <div className="rounded-full bg-accent-surface px-2 py-0.5 text-[11px] font-medium text-accent-text inline-block">
              Pulled from your competitor @{brand_context.competitor_match.handle.replace(/^@/, '')}
            </div>
          ) : null}
          <h2 className="accent-text text-lg font-semibold leading-tight">
            {video.engagement_hook_descriptor ?? video.title ?? 'Untitled video'}
          </h2>
        </header>

        <FormatActionBar
          video_id={video.id}
          client_id={brand_context?.client_id ?? null}
          initial={{
            is_saved: brand_context?.is_saved ?? false,
            is_pinned: brand_context?.is_pinned ?? false,
            is_dismissed: brand_context?.is_dismissed ?? false,
          }}
          brand_name={brand_name}
        />

        {video.why_it_works ? (
          <section className="space-y-1">
            <h3 className="text-xs font-medium uppercase tracking-wider text-white/50">Why it works</h3>
            <p className="text-sm text-white/85 leading-relaxed">{video.why_it_works}</p>
          </section>
        ) : null}

        {video.formats.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-white/50">Format dimensions</h3>
            <div className="flex flex-wrap gap-1.5">
              {video.formats.map((f) => {
                const confidence = f.confidence ?? 0;
                const muted = confidence < 0.4;
                return (
                  <span
                    key={`${f.kind}-${f.slug}`}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      muted
                        ? 'bg-surface text-white/50'
                        : 'bg-surface-hover text-white/90'
                    }`}
                    title={`${KIND_LABEL[f.kind]} · ${Math.round(confidence * 100)}% confidence${muted ? ' (low confidence)' : ''}`}
                  >
                    <span className="text-white/40 mr-1">{KIND_LABEL[f.kind]}:</span>
                    {f.display_name}
                    <span className="ml-1 text-white/40">{Math.round(confidence * 100)}%</span>
                    {muted ? <span className="ml-1 text-white/40">(low)</span> : null}
                  </span>
                );
              })}
            </div>
          </section>
        ) : null}

        {video.retention_pattern ? (
          <section className="space-y-1">
            <h3 className="text-xs font-medium uppercase tracking-wider text-white/50">Retention pattern</h3>
            <p className="text-sm italic text-white/75">{video.retention_pattern}</p>
          </section>
        ) : null}

        {video.raw_payload_top_comments.length > 0 ? (
          <section className="space-y-2">
            <button
              type="button"
              onClick={() => setCommentsOpen((v) => !v)}
              className="text-xs font-medium uppercase tracking-wider text-white/50 hover:text-white/80"
            >
              {commentsOpen ? 'Hide comments' : `Show comments (${video.raw_payload_top_comments.length})`}
            </button>
            {commentsOpen ? (
              <ul className="space-y-2">
                {video.raw_payload_top_comments.map((c, i) => (
                  <li key={i} className="rounded-md bg-surface p-3 text-sm">
                    <p className="text-white/85">{c.text}</p>
                    <p className="mt-1 text-[11px] text-white/40">
                      {c.author ? `@${c.author.replace(/^@/, '')}` : 'unknown'} · {c.likes.toLocaleString()} likes
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <section className="space-y-1">
          <h3 className="text-xs font-medium uppercase tracking-wider text-white/50">Source</h3>
          <a
            href={video.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent-text underline hover:no-underline"
          >
            Open on {platformLabel(video.platform)}
          </a>
        </section>
      </div>
    </div>
  );
}

function platformLabel(p: 'tiktok' | 'instagram' | 'youtube'): string {
  return p === 'tiktok' ? 'TikTok' : p === 'instagram' ? 'Instagram' : 'YouTube';
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
