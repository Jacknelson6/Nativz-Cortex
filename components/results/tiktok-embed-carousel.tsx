'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Calendar,
  ExternalLink,
  Loader2,
  Copy,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { PlatformSource } from '@/lib/types/search';
import type { MoodboardItem, TranscriptSegment } from '@/lib/types/moodboard';
import { formatCompactCount, formatRelativeTime } from '@/lib/utils/format';
import { engagementRatePercent } from '@/lib/search/source-mention-utils';
import { PlatformBadgeSearch } from '@/components/search/platform-icon';
import { parseVisionClipBreakdown } from '@/components/moodboard/vision-clip-breakdown-panel';

/**
 * Extract TikTok video ID from a TikTok URL.
 */
function extractTikTokVideoId(url: string): string | null {
  try {
    const match = url.match(/\/video\/(\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function formatTs(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function clipLabel(raw: string): string {
  const m: Record<string, string> = {
    talking_head: 'Talking head', b_roll: 'B-roll', product_focus: 'Product',
    text_overlay_heavy: 'Text overlay', meme_or_reaction: 'Hook',
    screen_recording: 'Screen', dance_or_trend: 'Trend', montage: 'Montage',
    transition: 'Transition', other: 'Other',
  };
  return m[raw] ?? raw.replace(/_/g, ' ');
}

function bucketSegments(segments: TranscriptSegment[], bucketSec = 3): { start: number; end: number; text: string }[] {
  if (!segments.length) return [];
  const map = new Map<number, string[]>();
  for (const seg of segments) {
    const bucket = Math.floor(seg.start / bucketSec) * bucketSec;
    const arr = map.get(bucket) ?? [];
    arr.push(seg.text.trim());
    map.set(bucket, arr);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([start, texts]) => ({
    start, end: start + bucketSec, text: texts.join(' ').replace(/\s+/g, ' ').trim(),
  }));
}

interface TikTokEmbedCarouselProps {
  sources: PlatformSource[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  topicSearchId: string;
}

export function TikTokEmbedCarousel({
  sources,
  initialIndex,
  open,
  onClose,
  topicSearchId,
}: TikTokEmbedCarouselProps) {
  const [index, setIndex] = useState(initialIndex);
  const [analysisItem, setAnalysisItem] = useState<MoodboardItem | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [rescriptLoading, setRescriptLoading] = useState(false);
  const [rescriptText, setRescriptText] = useState<string | null>(null);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const source = sources[index] ?? null;
  const videoId = source ? extractTikTokVideoId(source.url) : null;
  const total = sources.length;

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : total - 1));
  }, [total]);

  const goNext = useCallback(() => {
    setIndex((i) => (i < total - 1 ? i + 1 : 0));
  }, [total]);

  // Auto-trigger analysis when video changes
  useEffect(() => {
    if (!open || !source) return;
    let cancelled = false;
    setAnalysisItem(null);
    setAnalysisLoading(true);
    setRescriptText(null);
    setRescriptLoading(false);

    async function loadAnalysis() {
      try {
        // Create or reuse existing analysis item
        const createRes = await fetch('/api/analysis/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic_search_id: topicSearchId, url: source!.url, type: 'video' }),
        });
        if (!createRes.ok || cancelled) { setAnalysisLoading(false); return; }
        let item = (await createRes.json()) as MoodboardItem;
        if (cancelled) return;
        setAnalysisItem(item);

        const hasTranscriptAlready = (item.transcript && item.transcript.length > 0) || (item.transcript_segments?.length ?? 0) > 0;
        const hasFramesAlready = Array.isArray(item.frames) && item.frames.length > 0;
        const hasHookAlready = !!item.hook_analysis;

        if (hasTranscriptAlready && hasFramesAlready && hasHookAlready) {
          setAnalysisLoading(false);
          return;
        }

        // Transcribe if needed
        if (!hasTranscriptAlready) {
          const tr = await fetch(`/api/analysis/items/${item.id}/transcribe`, { method: 'POST' });
          if (tr.ok && !cancelled) { item = await tr.json(); setAnalysisItem(item); }
        }

        // Extract frames if needed
        if (!hasFramesAlready) {
          try {
            const fr = await fetch(`/api/analysis/items/${item.id}/extract-frames`, { method: 'POST' });
            if (fr.ok && !cancelled) {
              item = await fr.json();
              setAnalysisItem(item);
            } else if (!cancelled) {
              const errData = await fr.json().catch(() => ({}));
              console.warn('[carousel] Frame extraction failed:', fr.status, errData);
            }
          } catch (e) {
            console.warn('[carousel] Frame extraction error:', e);
          }
        }

        // Analyze hook if needed
        if (!hasHookAlready) {
          const an = await fetch(`/api/analysis/items/${item.id}/analyze`, { method: 'POST' });
          if (an.ok && !cancelled) { item = await an.json(); setAnalysisItem(item); }
        }

        // Final re-fetch to ensure we have the latest data (frames may have been written by extract-frames)
        if (!cancelled) {
          try {
            const finalRes = await fetch(`/api/analysis/items/${item.id}`);
            if (finalRes.ok) {
              const finalItem = await finalRes.json();
              setAnalysisItem(finalItem as MoodboardItem);
            }
          } catch { /* best effort */ }
        }
      } catch {
        // Analysis is best-effort
      } finally {
        if (!cancelled) setAnalysisLoading(false);
      }
    }

    void loadAnalysis();
    return () => { cancelled = true; };
  }, [open, index, source?.url, topicSearchId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, goPrev, goNext]);

  if (!open || !source) return null;

  const er = engagementRatePercent(source);
  const hasTranscript = !!(source.transcript ?? '').trim();

  return (
    <div className="fixed inset-0 z-[70] flex">
      {/* Backdrop — clicking anywhere in the dimmed area closes */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="absolute inset-0 bg-black/90"
        onClick={onClose}
      />

      {/* Main layout */}
      <div className="relative flex h-full w-full" onClick={onClose}>
        {/* Left section: video area — clicking blank space here DOES close */}
        <div className="flex flex-1 items-center justify-center pr-[480px]">
          {/* Arrow + Video + Arrow — inline flex so arrows stay next to video */}
          <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={goPrev}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
              aria-label="Previous video"
            >
              <ChevronLeft size={20} />
            </button>

            {/* TikTok embed */}
            {videoId ? (
              <iframe
                key={videoId}
                src={`https://www.tiktok.com/player/v1/${videoId}?music_info=1&description=1&autoplay=1&mute=1`}
                className="rounded-2xl border-0"
                style={{ width: '420px', height: '750px' }}
                allow="encrypted-media; fullscreen"
                allowFullScreen
              />
            ) : (
              <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-white/50" style={{ width: '420px', height: '750px' }}>
                <div className="text-center px-4">
                  <p>Embed unavailable</p>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-accent-text hover:underline"
                  >
                    Open on TikTok <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={goNext}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
              aria-label="Next video"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Right sidebar — stop propagation so clicking here doesn't close */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div className="absolute right-0 top-0 z-10 flex h-full w-[480px] flex-col border-l border-white/10 bg-surface/95 backdrop-blur-md" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-nativz-border/60 px-5 py-4">
            <h3 className="text-sm font-semibold text-text-primary">Video details</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-text-muted hover:bg-surface-hover hover:text-text-secondary"
            >
              <X size={16} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Creator */}
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">Creator</p>
              <div className="flex items-center gap-3">
                {source.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={source.thumbnailUrl}
                    alt={source.author ?? ''}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-hover text-sm font-semibold text-text-secondary">
                    {(source.author?.[0] ?? '?').toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {source.author || 'Unknown creator'}
                  </p>
                  <p className="text-xs text-text-muted">
                    @{(source.author ?? '').replace(/^@/, '')}
                  </p>
                </div>
              </div>
            </section>

            {/* Description */}
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">Description</p>
              <p className="text-sm leading-relaxed text-text-secondary">
                {source.content || source.title || 'No description'}
              </p>
            </section>

            {/* Performance */}
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Performance</p>
              <div className="space-y-2.5">
                {source.engagement.views != null && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-text-secondary">
                      <Eye size={14} className="text-text-muted" /> Views
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-text-primary">
                      {formatCompactCount(source.engagement.views)}
                    </span>
                  </div>
                )}
                {source.engagement.likes != null && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-text-secondary">
                      <Heart size={14} className="text-text-muted" /> Likes
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-text-primary">
                      {formatCompactCount(source.engagement.likes)}
                    </span>
                  </div>
                )}
                {source.engagement.comments != null && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-text-secondary">
                      <MessageCircle size={14} className="text-text-muted" /> Comments
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-text-primary">
                      {formatCompactCount(source.engagement.comments)}
                    </span>
                  </div>
                )}
                {source.engagement.shares != null && source.engagement.shares > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-text-secondary">
                      <Share2 size={14} className="text-text-muted" /> Shares
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-text-primary">
                      {formatCompactCount(source.engagement.shares)}
                    </span>
                  </div>
                )}
                {er != null && (
                  <div className="flex items-center justify-between border-t border-nativz-border/40 pt-2.5">
                    <span className="text-sm font-medium text-text-secondary">Engagement rate</span>
                    <span className="text-sm font-semibold tabular-nums text-accent-text">{er.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            </section>

            {/* Details */}
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Details</p>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-text-secondary">
                    <Calendar size={14} className="text-text-muted" /> Published
                  </span>
                  <span className="text-sm text-text-primary">{formatRelativeTime(source.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-text-secondary">
                    <PlatformBadgeSearch platform={source.platform} size="sm" /> Platform
                  </span>
                  <span className="text-sm font-medium capitalize text-text-primary">{source.platform}</span>
                </div>
              </div>
            </section>

            {/* Analysis — auto-loaded */}
            {analysisLoading && !analysisItem && (
              <div className="flex items-center gap-2 text-xs text-text-muted py-2">
                <Loader2 size={12} className="animate-spin" /> Loading analysis…
              </div>
            )}

            {/* Hook analysis */}
            {(analysisItem?.hook_analysis || analysisItem?.hook) && (
              <section>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">Hook analysis</p>
                <div className="rounded-lg border border-accent/20 bg-accent-surface/30 p-3 space-y-2">
                  {analysisItem.hook && (
                    <p className="text-xs font-medium text-accent-text">&ldquo;{analysisItem.hook}&rdquo;</p>
                  )}
                  {analysisItem.hook_analysis && (
                    <p className="text-sm leading-relaxed text-text-secondary">{analysisItem.hook_analysis}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {analysisItem.hook_type && (
                      <Badge variant="info" className="text-[10px]">{analysisItem.hook_type.replace(/_/g, ' ')}</Badge>
                    )}
                    {analysisItem.hook_score != null && (
                      <span className="text-xs font-semibold text-accent-text">Score {analysisItem.hook_score}/10</span>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Transcript */}
            {(() => {
              const transcript = analysisItem?.transcript ?? source.transcript ?? '';
              if (!transcript.trim()) return null;
              return (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                      {rescriptText ? 'Rescript' : 'Transcript'}
                    </p>
                    <div className="flex items-center gap-1">
                      {analysisItem?.id && !rescriptText && (
                        <button
                          type="button"
                          disabled={rescriptLoading}
                          onClick={async () => {
                            if (!analysisItem?.id) return;
                            setRescriptLoading(true);
                            try {
                              const res = await fetch(`/api/analysis/items/${analysisItem.id}/rescript`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({}),
                              });
                              if (res.ok) {
                                const data = await res.json();
                                const script = data?.rescript?.adapted_script;
                                if (script) {
                                  setRescriptText(script);
                                  toast.success('Rescript ready');
                                }
                              } else {
                                toast.error('Rescript failed');
                              }
                            } catch {
                              toast.error('Rescript failed');
                            } finally {
                              setRescriptLoading(false);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-accent-text hover:bg-accent-surface transition-colors disabled:opacity-50"
                        >
                          <Sparkles size={13} /> {rescriptLoading ? 'Rescripting...' : 'Rescript'}
                        </button>
                      )}
                      {rescriptText && (
                        <button
                          type="button"
                          onClick={() => setRescriptText(null)}
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-text-muted hover:bg-surface-hover transition-colors"
                        >
                          Show original
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(rescriptText ?? transcript);
                          toast.success(rescriptText ? 'Rescript copied' : 'Transcript copied');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
                      >
                        <Copy size={13} /> Copy
                      </button>
                    </div>
                  </div>
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-nativz-border bg-background/40 p-3 text-sm leading-relaxed text-text-secondary">
                    {rescriptText ?? transcript}
                  </div>
                </section>
              );
            })()}

            {/* Frame breakdown */}
            {(() => {
              const segments = analysisItem?.transcript_segments ?? [];
              const frames = analysisItem?.frames ?? [];
              const vision = parseVisionClipBreakdown(analysisItem?.metadata?.vision_clip_breakdown);
              const clips = vision?.clips ?? [];
              const buckets = bucketSegments(segments, 3);

              if (buckets.length === 0 && frames.length === 0) {
                if (analysisLoading) return (
                  <div className="flex items-center gap-2 text-xs text-text-muted py-1">
                    <Loader2 size={12} className="animate-spin" /> Extracting frames…
                  </div>
                );
                return null;
              }

              return (
                <section>
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                    Frame breakdown{frames.length > 0 ? ` (${frames.length})` : ''}
                  </p>
                  <ul className="max-h-60 space-y-1.5 overflow-y-auto">
                    {buckets.map((b) => {
                      const ct = clips.find((c) => c.startSec < b.end && c.endSec > b.start)?.clipType ?? 'other';
                      const matchFrame = frames.length > 0
                        ? frames.reduce((best, f) => Math.abs(f.timestamp - b.start) < Math.abs(best.timestamp - b.start) ? f : best)
                        : undefined;
                      return (
                        <li key={b.start} className="flex gap-2 rounded-lg border border-nativz-border/60 bg-surface-hover/20 p-1.5 text-sm">
                          {matchFrame && (
                            <div className="relative w-10 shrink-0 overflow-hidden rounded border border-nativz-border">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={matchFrame.url} alt="" className="aspect-[9/16] w-full object-cover" loading="lazy" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="font-mono text-xs text-text-muted">{formatTs(b.start)}–{formatTs(b.end)}</span>
                              <Badge variant="mono" className="text-xs px-1 py-0">{clipLabel(ct)}</Badge>
                            </div>
                            <p className="text-text-secondary leading-snug">{b.text || '—'}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })()}

            {/* View original */}
            <div className="pt-2">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-nativz-border px-4 py-2.5 text-sm font-medium text-text-secondary transition hover:bg-surface-hover"
              >
                <ExternalLink size={14} />
                View original
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
