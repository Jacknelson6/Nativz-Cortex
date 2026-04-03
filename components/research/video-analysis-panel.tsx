'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X,
  Play,
  Loader2,
  Film,
  Sparkles,
  Download,
  CheckCircle2,
  Circle,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { MoodboardItem, TranscriptSegment, RescriptData } from '@/lib/types/moodboard';
import { parseVisionClipBreakdown } from '@/components/moodboard/vision-clip-breakdown-panel';

const RECLIP_BASE = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_RECLIP_URL || 'http://localhost:8899' : '';

type StepState = 'idle' | 'running' | 'done' | 'error';

export interface VideoAnalysisPanelProps {
  open: boolean;
  onClose: () => void;
  /** Page URL for the video (YouTube, TikTok, etc.) */
  sourceUrl: string;
  topicSearchId: string;
  /** When set, enables rescript for this client */
  clientId: string | null;
  clientName?: string | null;
  /** Scroll to rescript section when panel opens */
  focusRescript?: boolean;
}

function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}`;
      const shorts = u.pathname.match(/\/shorts\/([^/?]+)/);
      if (shorts?.[1]) return `https://www.youtube.com/embed/${shorts[1]}`;
    }
    return null;
  } catch {
    return null;
  }
}

function formatTs(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
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
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, texts]) => ({
      start,
      end: start + bucketSec,
      text: texts.join(' ').replace(/\s+/g, ' ').trim(),
    }));
}

function clipLabel(raw: string): string {
  const m: Record<string, string> = {
    talking_head: 'Talking head',
    b_roll: 'B-roll',
    broll: 'B-roll',
    product_focus: 'Product shot',
    product_shot: 'Product shot',
    text_overlay_heavy: 'Text overlay',
    text_screen: 'Text overlay',
    meme_or_reaction: 'Hook',
    screen_recording: 'Screen',
    dance_or_trend: 'Trend',
    montage: 'Montage',
    transition: 'Transition',
    other: 'Other',
  };
  return m[raw] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function findClipTypeForRange(
  clips: { startSec: number; endSec: number; clipType: string }[],
  start: number,
  end: number,
): string {
  for (const c of clips) {
    if (c.startSec < end && c.endSec > start) return c.clipType;
  }
  return clips[0]?.clipType ?? 'other';
}

export function VideoAnalysisPanel({
  open,
  onClose,
  sourceUrl,
  topicSearchId,
  clientId,
  clientName,
  focusRescript,
}: VideoAnalysisPanelProps) {
  const [item, setItem] = useState<MoodboardItem | null>(null);
  const [createStep, setCreateStep] = useState<StepState>('idle');
  const [transcribeStep, setTranscribeStep] = useState<StepState>('idle');
  const [framesStep, setFramesStep] = useState<StepState>('idle');
  const [analyzeStep, setAnalyzeStep] = useState<StepState>('idle');
  const [mp4Url, setMp4Url] = useState<string | null>(null);
  const [rescriptLoading, setRescriptLoading] = useState(false);
  const [rescriptData, setRescriptData] = useState<RescriptData | null>(null);
  const [rescriptOpen, setRescriptOpen] = useState(false);

  const reset = useCallback(() => {
    setItem(null);
    setCreateStep('idle');
    setTranscribeStep('idle');
    setFramesStep('idle');
    setAnalyzeStep('idle');
    setMp4Url(null);
    setRescriptLoading(false);
    setRescriptData(null);
    setRescriptOpen(false);
  }, []);

  const fetchItem = useCallback(async (id: string) => {
    const res = await fetch(`/api/analysis/items/${id}`);
    if (!res.ok) throw new Error('Failed to load analysis item');
    return (await res.json()) as MoodboardItem;
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }

    let cancelled = false;

    async function runPipeline() {
      reset();
      setCreateStep('running');
      try {
        // Create or reuse existing analysis item (API deduplicates by URL + board)
        const createRes = await fetch('/api/analysis/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic_search_id: topicSearchId,
            url: sourceUrl,
            type: 'video',
          }),
        });
        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || 'Could not start analysis');
        }
        let current = (await createRes.json()) as MoodboardItem;
        if (cancelled) return;
        setItem(current);
        setCreateStep('done');

        // Check what's already been done — skip completed steps
        const hasTranscript =
          (current.transcript && current.transcript.length > 0) ||
          (current.transcript_segments?.length ?? 0) > 0;
        const hasFrames = Array.isArray(current.frames) && current.frames.length > 0;
        const hasAnalysis = !!current.hook_analysis;

        // If everything is already done, just show the existing analysis
        if (hasTranscript && hasFrames && hasAnalysis) {
          setTranscribeStep('done');
          setFramesStep('done');
          setAnalyzeStep('done');
          // Try to get video URL
          try {
            const vu = await fetch(`/api/analysis/items/${current.id}/video-url`);
            if (vu.ok) {
              const { videoUrl } = (await vu.json()) as { videoUrl?: string };
              if (videoUrl && !cancelled) setMp4Url(videoUrl);
            }
          } catch { /* optional */ }
          return;
        }

        // Transcribe if needed
        if (!hasTranscript) {
          setTranscribeStep('running');
          const deadline = Date.now() + 120_000;
          while (Date.now() < deadline && !cancelled) {
            current = await fetchItem(current.id);
            setItem(current);
            const gotTranscript =
              (current.transcript && current.transcript.length > 0) ||
              (current.transcript_segments?.length ?? 0) > 0;
            if (gotTranscript) break;
            await new Promise((r) => setTimeout(r, 2000));
          }

          if (!cancelled) {
            const gotTranscript =
              (current.transcript && current.transcript.length > 0) ||
              (current.transcript_segments?.length ?? 0) > 0;
            if (!gotTranscript) {
              const tr = await fetch(`/api/analysis/items/${current.id}/transcribe`, { method: 'POST' });
              if (tr.ok) {
                current = await tr.json();
                setItem(current);
              }
            }
          }
        }
        setTranscribeStep('done');

        // Extract frames if needed
        if (!hasFrames) {
          setFramesStep('running');
          const fr = await fetch(`/api/analysis/items/${current.id}/extract-frames`, { method: 'POST' });
          if (fr.ok) {
            current = await fr.json();
            setItem(current);
            setFramesStep('done');
          } else {
            setFramesStep('error');
          }
        } else {
          setFramesStep('done');
        }

        // Analyze if needed
        if (!hasAnalysis) {
          setAnalyzeStep('running');
          const an = await fetch(`/api/analysis/items/${current.id}/analyze`, { method: 'POST' });
          if (an.ok) {
            current = await an.json();
            setItem(current);
            setAnalyzeStep('done');
          } else {
            setAnalyzeStep('error');
          }
        } else {
          setAnalyzeStep('done');
        }

        // Try to get video URL
        let resolvedMp4: string | null = null;
        try {
          const vu = await fetch(`/api/analysis/items/${current.id}/video-url`);
          if (vu.ok) {
            const { videoUrl } = (await vu.json()) as { videoUrl?: string };
            if (videoUrl && !cancelled) {
              resolvedMp4 = videoUrl;
              setMp4Url(videoUrl);
            }
          }
        } catch {
          /* optional */
        }

        if (!cancelled && !resolvedMp4 && RECLIP_BASE) {
          try {
            const dl = await fetch(`${RECLIP_BASE}/api/download`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: sourceUrl, format: 'mp4' }),
            });
            if (dl.ok) {
              const { job_id } = (await dl.json()) as { job_id?: string };
              if (job_id) {
                for (let i = 0; i < 30 && !cancelled; i++) {
                  await new Promise((r) => setTimeout(r, 2000));
                  const st = await fetch(`${RECLIP_BASE}/api/status/${job_id}`);
                  if (!st.ok) continue;
                  const status = (await st.json()) as { status?: string };
                  if (status.status === 'done') {
                    setMp4Url(`${RECLIP_BASE}/api/file/${job_id}`);
                    break;
                  }
                  if (status.status === 'error') break;
                }
              }
            }
          } catch {
            /* CORS or ReClip off */
          }
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Analysis failed');
          setCreateStep((s) => (s === 'running' ? 'error' : s));
        }
      }
    }

    void runPipeline();
    return () => {
      cancelled = true;
    };
  }, [open, sourceUrl, topicSearchId, reset, fetchItem]);

  useEffect(() => {
    if (!open || !focusRescript || !clientId) return;
    const t = window.setTimeout(() => {
      document.getElementById('video-analysis-rescript')?.scrollIntoView({ behavior: 'smooth' });
    }, 400);
    return () => window.clearTimeout(t);
  }, [open, focusRescript, clientId, item?.id]);

  const vision = useMemo(
    () => parseVisionClipBreakdown(item?.metadata?.vision_clip_breakdown),
    [item?.metadata],
  );
  const buckets = useMemo(
    () => bucketSegments(item?.transcript_segments ?? [], 3),
    [item?.transcript_segments],
  );
  const hookWindow = useMemo(() => {
    const segs = item?.transcript_segments ?? [];
    return segs.filter((s) => s.start < 5);
  }, [item?.transcript_segments]);

  const ytEmbed = youtubeEmbedUrl(sourceUrl);

  async function runRescript() {
    if (!item?.id || !clientId) return;
    setRescriptLoading(true);
    try {
      const res = await fetch(`/api/analysis/items/${item.id}/rescript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Rescript failed');
      const script = (data as { rescript?: RescriptData }).rescript;
      if (script) {
        setRescriptData(script);
        toast.success('Rescript ready');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Rescript failed');
    } finally {
      setRescriptLoading(false);
    }
  }

  if (!open) return null;

  const clips = vision?.clips ?? [];

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/50 transition-opacity" onClick={onClose} aria-hidden />

      <div className="relative flex h-full w-full max-w-lg flex-col border-l border-nativz-border bg-surface shadow-elevated animate-in slide-in-from-right duration-200">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-nativz-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Film size={18} className="shrink-0 text-accent-text" />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-text-primary">Video analysis</h2>
              <p className="truncate text-xs text-text-muted">{item?.title || 'Processing…'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-nativz-border px-4 py-2">
          <div className="flex flex-wrap gap-2 text-[11px] text-text-muted">
            <StepChip label="Create" state={createStep} />
            <StepChip label="Transcribe" state={transcribeStep} />
            <StepChip label="Frames" state={framesStep} />
            <StepChip label="Analyze" state={analyzeStep} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* Preview */}
          <section className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Preview</p>
            <div className="overflow-hidden rounded-xl border border-nativz-border bg-black/40">
              {ytEmbed ? (
                <div className="aspect-video w-full">
                  <iframe
                    title="Video preview"
                    src={ytEmbed}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : mp4Url ? (
                <video src={mp4Url} controls className="max-h-[320px] w-full" playsInline />
              ) : item?.thumbnail_url ? (
                <div className="relative aspect-video w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" />
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-90 transition hover:bg-black/55"
                  >
                    <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900">
                      <Play size={16} className="fill-current" />
                      Watch
                    </span>
                  </a>
                </div>
              ) : (
                <div className="flex aspect-video items-center justify-center text-sm text-text-muted">
                  No preview
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border bg-surface-hover/40 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover"
              >
                <Play size={14} />
                Open source
              </a>
              {mp4Url && (
                <a
                  href={mp4Url}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border bg-surface-hover/60 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-hover"
                >
                  <Download size={14} />
                  Download mp4
                </a>
              )}
            </div>
          </section>

          {/* Frame Type Breakdown Pie Chart */}
          {clips.length > 0 && (
            <section className="space-y-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
                Frame type breakdown
              </p>
              <FrameTypePieChart clips={clips} />
            </section>
          )}

          {/* Transcript — plain text, no timestamps */}
          <section className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Transcript</p>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-nativz-border bg-background/40 p-3 text-sm leading-relaxed text-text-secondary">
              {item?.transcript?.trim() ? (
                <p className="whitespace-pre-wrap">{item.transcript}</p>
              ) : (item?.transcript_segments?.length ?? 0) > 0 ? (
                <p className="whitespace-pre-wrap">
                  {item!.transcript_segments!.map((s) => s.text).join(' ')}
                </p>
              ) : transcribeStep === 'running' ? (
                <p className="flex items-center gap-2 text-text-muted">
                  <Loader2 size={14} className="animate-spin" /> Transcribing…
                </p>
              ) : (
                <p className="text-text-muted">No transcript yet.</p>
              )}
            </div>
          </section>

          {/* Frame-by-frame breakdown — extracted frames + transcript + clip type */}
          <section className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
              Frame breakdown{(item?.frames?.length ?? 0) > 0 ? ` (${item!.frames.length} frames)` : ''}
            </p>
            {buckets.length > 0 ? (
              <ul className="max-h-[min(60vh,520px)] space-y-2 overflow-y-auto pr-1">
                {buckets.map((b) => {
                  const ct = findClipTypeForRange(clips, b.start, b.end);
                  const frames = item?.frames ?? [];
                  const matchingFrame = frames.length > 0
                    ? frames.reduce((best, frame) => {
                        return Math.abs(frame.timestamp - b.start) < Math.abs(best.timestamp - b.start) ? frame : best;
                      })
                    : undefined;
                  return (
                    <li
                      key={b.start}
                      className="flex gap-3 rounded-lg border border-nativz-border/80 bg-surface-hover/20 p-2 text-xs"
                    >
                      {matchingFrame && (
                        <div className="relative w-16 shrink-0 overflow-hidden rounded-md border border-nativz-border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={matchingFrame.url} alt={matchingFrame.label} className="aspect-[9/16] w-full object-cover" loading="lazy" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 py-0.5">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] text-text-muted">
                            {formatTs(b.start)}–{formatTs(b.end)}
                          </span>
                          <Badge variant="mono" className="text-[10px]">
                            {clipLabel(ct)}
                          </Badge>
                        </div>
                        <p className="text-text-secondary leading-snug">{b.text || '—'}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (item?.frames?.length ?? 0) > 0 ? (
              /* Frames exist but no transcript segments — show frames in a grid */
              <div className="grid grid-cols-4 gap-1.5">
                {item!.frames.map((frame, fi) => (
                  <div key={fi} className="relative overflow-hidden rounded-lg border border-nativz-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={frame.url} alt={frame.label} className="aspect-[9/16] w-full object-cover" loading="lazy" />
                    <div className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center font-mono text-[9px] text-white">
                      {frame.label}
                    </div>
                  </div>
                ))}
              </div>
            ) : framesStep === 'running' ? (
              <p className="flex items-center gap-2 text-xs text-text-muted">
                <Loader2 size={12} className="animate-spin" /> Extracting frames…
              </p>
            ) : (
              <p className="text-xs text-text-muted">No frames extracted yet.</p>
            )}
          </section>

          {/* Hook */}
          <section className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Hook (first ~5s)</p>
            <div className="rounded-lg border border-accent/20 bg-accent-surface/30 p-3 space-y-2">
              {hookWindow.length > 0 && (
                <div className="text-xs text-text-secondary">
                  {hookWindow.map((s, i) => (
                    <p key={i}>
                      <span className="mr-2 font-mono text-[10px] text-accent-text">{formatTs(s.start)}</span>
                      {s.text}
                    </p>
                  ))}
                </div>
              )}
              {item?.hook_analysis && (
                <p className="text-sm text-text-secondary leading-relaxed">
                  <span className="font-medium text-text-primary">Stop-the-scroll: </span>
                  {item.hook_analysis}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {item?.hook_type && (
                  <Badge variant="info" className="text-[10px]">
                    {item.hook_type.replace(/_/g, ' ')}
                  </Badge>
                )}
                {item?.hook_score != null && (
                  <span className="text-sm font-semibold text-accent-text">
                    Score {item.hook_score}/10
                  </span>
                )}
              </div>
              {analyzeStep === 'running' && (
                <p className="flex items-center gap-2 text-xs text-text-muted">
                  <Loader2 size={12} className="animate-spin" /> Scoring hook…
                </p>
              )}
            </div>
          </section>

          {/* Rescript */}
          {clientId && (
            <section className="space-y-2" id="video-analysis-rescript">
              <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
                Rescript{clientName ? ` for ${clientName}` : ''}
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={rescriptLoading || !item?.id || analyzeStep !== 'done'}
                onClick={() => {
                  setRescriptOpen(true);
                  void runRescript();
                }}
                className="w-full sm:w-auto"
              >
                {rescriptLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                Rescript for {clientName || 'client'}
              </Button>
              {(rescriptOpen || rescriptLoading || rescriptData || item?.rescript) && (
                <div className="rounded-lg border border-nativz-border bg-background/40 p-3 text-sm space-y-2">
                  {(rescriptData ?? item?.rescript) && (
                    <>
                      <p className="text-xs font-medium text-text-muted">New hook</p>
                      <p className="text-text-primary">
                        {(rescriptData ?? item?.rescript)?.hook_alternatives?.[0] ?? '—'}
                      </p>
                      <p className="text-xs font-medium text-text-muted pt-2">Script</p>
                      <pre className="whitespace-pre-wrap text-xs text-text-secondary max-h-48 overflow-y-auto">
                        {(rescriptData ?? item?.rescript)?.adapted_script ?? '—'}
                      </pre>
                    </>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function StepChip({ label, state }: { label: string; state: StepState }) {
  const icon =
    state === 'done' ? (
      <CheckCircle2 size={12} className="text-emerald-400" />
    ) : state === 'running' ? (
      <Loader2 size={12} className="animate-spin text-accent-text" />
    ) : state === 'error' ? (
      <AlertCircle size={12} className="text-amber-400" />
    ) : (
      <Circle size={12} className="text-text-muted/50" />
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-nativz-border/60 bg-background/30 px-2 py-0.5">
      {icon}
      {label}
    </span>
  );
}

const PIE_COLORS: Record<string, string> = {
  talking_head: '#5ba3e6',
  b_roll: '#22c55e',
  broll: '#22c55e',
  product_focus: '#f59e0b',
  product_shot: '#f59e0b',
  text_overlay_heavy: '#a855f7',
  text_screen: '#a855f7',
  meme_or_reaction: '#ec4899',
  screen_recording: '#6366f1',
  dance_or_trend: '#14b8a6',
  montage: '#ef4444',
  transition: '#64748b',
  other: '#475569',
};

function FrameTypePieChart({
  clips,
}: {
  clips: { startSec: number; endSec: number; clipType: string }[];
}) {
  const totalDuration = clips.reduce((sum, c) => sum + (c.endSec - c.startSec), 0) || 1;
  const typeMap = new Map<string, number>();
  for (const clip of clips) {
    const dur = clip.endSec - clip.startSec;
    typeMap.set(clip.clipType, (typeMap.get(clip.clipType) ?? 0) + dur);
  }

  const segments = [...typeMap.entries()]
    .map(([type, dur]) => ({
      type,
      label: clipLabel(type),
      pct: Math.round((dur / totalDuration) * 100),
      color: PIE_COLORS[type] ?? '#475569',
    }))
    .sort((a, b) => b.pct - a.pct);

  // Build SVG pie chart (conic via stroke-dasharray on circles)
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={100} height={100} viewBox="0 0 100 100" className="shrink-0">
        {segments.map((seg) => {
          const dashLen = (seg.pct / 100) * circumference;
          const dashGap = circumference - dashLen;
          const currentOffset = offset;
          offset += dashLen;
          return (
            <circle
              key={seg.type}
              cx={50}
              cy={50}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={18}
              strokeDasharray={`${dashLen} ${dashGap}`}
              strokeDashoffset={-currentOffset}
              transform="rotate(-90 50 50)"
            />
          );
        })}
      </svg>
      <ul className="flex-1 space-y-1.5">
        {segments.map((seg) => (
          <li key={seg.type} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            <span className="flex-1 text-text-secondary">{seg.label}</span>
            <span className="tabular-nums text-text-muted">{seg.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
