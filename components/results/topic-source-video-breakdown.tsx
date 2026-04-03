'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy as CopyIcon,
  FileText,
  Image as ImageIcon,
  Loader2,
  Search,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { TranscriptSegment } from '@/lib/types/moodboard';
import type { PlatformSource } from '@/lib/types/search';
import { VisionClipBreakdownPanel, parseVisionClipBreakdown } from '@/components/moodboard/vision-clip-breakdown-panel';

interface TopicSourceVideoBreakdownProps {
  searchId: string;
  source: PlatformSource;
  onSourcePatched?: (updated: PlatformSource) => void;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getTranscriptAtTimestamp(
  segments: TranscriptSegment[],
  timestamp: number,
  intervalSec: number,
): string {
  if (segments.length === 0) return '';
  const endTs = timestamp + intervalSec;
  const matching = segments.filter((s) => s.start < endTs && s.end > timestamp);
  if (matching.length > 0) return matching.map((s) => s.text).join(' ');
  const nearest = segments.reduce((prev, curr) =>
    Math.abs(curr.start - timestamp) < Math.abs(prev.start - timestamp) ? curr : prev,
  );
  return nearest.text;
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  const q = query.toLowerCase();
  return parts.map((part, i) =>
    part.toLowerCase() === q ? (
      <mark key={i} className="bg-yellow-400/30 text-text-primary rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function renderHighlighted(text: string): React.ReactNode {
  const parts = text.split(/(<<<HIGHLIGHT>>>|<<<ENDHIGHLIGHT>>>)/);
  let inHighlight = false;
  return parts.map((part, i) => {
    if (part === '<<<HIGHLIGHT>>>') {
      inHighlight = true;
      return null;
    }
    if (part === '<<<ENDHIGHLIGHT>>>') {
      inHighlight = false;
      return null;
    }
    return inHighlight ? (
      <mark key={i} className="bg-yellow-400/30 text-text-primary rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    );
  });
}

export function TopicSourceVideoBreakdown({ searchId, source: initial, onSourcePatched }: TopicSourceVideoBreakdownProps) {
  const router = useRouter();
  const [source, setSource] = useState(initial);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeFailed, setTranscribeFailed] = useState(false);
  const [extractingFrames, setExtractingFrames] = useState(false);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    setSource(initial);
  }, [initial]);

  const patchAndNotify = useCallback(
    (next: PlatformSource) => {
      setSource(next);
      onSourcePatched?.(next);
      router.refresh();
    },
    [onSourcePatched, router],
  );

  const runTranscribe = useCallback(async () => {
    setTranscribing(true);
    setTranscribeFailed(false);
    try {
      const res = await fetch(`/api/search/${searchId}/sources/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: source.platform, source_id: source.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transcription failed');
      patchAndNotify(data.source as PlatformSource);
      toast.success('Transcript ready');
    } catch (e) {
      setTranscribeFailed(true);
      toast.error(e instanceof Error ? e.message : 'Transcription failed');
    } finally {
      setTranscribing(false);
    }
  }, [searchId, source.platform, source.id, patchAndNotify]);

  useEffect(() => {
    if (autoStartedRef.current) return;
    if ((source.transcript ?? '').trim()) return;
    autoStartedRef.current = true;
    void runTranscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mood board: auto-run once on open
  }, []);

  const runExtractFrames = useCallback(async () => {
    if (source.platform !== 'tiktok') {
      toast.error(
        'Frame extraction in research uses TikTok direct URLs. Add this video to a mood board for full YouTube analysis.',
      );
      return;
    }
    setExtractingFrames(true);
    toast.info('Extracting frames…', { duration: 4000 });
    try {
      const res = await fetch(`/api/search/${searchId}/sources/extract-frames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: source.platform, source_id: source.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Frame extraction failed');
      patchAndNotify(data.source as PlatformSource);
      toast.success('Frames extracted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Frame extraction failed');
    } finally {
      setExtractingFrames(false);
    }
  }, [searchId, source.platform, source.id, patchAndNotify]);

  const handleCopy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard');
  }, []);

  const segments = useMemo(
    () => (Array.isArray(source.transcript_segments) ? source.transcript_segments : []) as TranscriptSegment[],
    [source.transcript_segments],
  );
  const frames = useMemo(
    () => (Array.isArray(source.frames) ? source.frames : []),
    [source.frames],
  );
  const hasFrames = frames.length > 0;
  const isTranscribed = !!(source.transcript ?? '').trim();
  const hasSegments = segments.length > 0;
  const videoDurationSec = source.duration_sec ?? 30;

  const visionBreakdown = useMemo(
    () => parseVisionClipBreakdown(source.metadata?.vision_clip_breakdown),
    [source.metadata],
  );

  const filteredSegments = useMemo(() => {
    if (!searchQuery.trim()) return segments;
    const q = searchQuery.toLowerCase();
    return segments.filter((s) => s.text.toLowerCase().includes(q));
  }, [segments, searchQuery]);

  const highlightedTranscript = useMemo(() => {
    if (!source.transcript || !searchQuery.trim()) return null;
    const q = searchQuery.trim();
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return source.transcript.replace(regex, '<<<HIGHLIGHT>>>$1<<<ENDHIGHLIGHT>>>');
  }, [source.transcript, searchQuery]);

  if (!isTranscribed && extractingFrames && !hasFrames) {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface-hover/20 p-8 text-center">
        <Loader2 size={24} className="mx-auto mb-3 animate-spin text-accent-text" />
        <p className="text-sm text-text-muted">Extracting frames from video…</p>
        <p className="mx-auto mt-2 max-w-sm text-xs text-text-muted">
          Works without a transcript — we analyze stills for b-roll, talking head, memes, and more.
        </p>
      </div>
    );
  }

  if (!isTranscribed && transcribing) {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface-hover/20 p-8 text-center space-y-4">
        <Loader2 size={24} className="mx-auto animate-spin text-accent-text" />
        <p className="text-sm text-text-muted">Transcribing video…</p>
        <button
          type="button"
          onClick={() => void runExtractFrames()}
          disabled={extractingFrames || source.platform !== 'tiktok'}
          className="inline-flex items-center gap-2 rounded-lg border border-nativz-border px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50"
        >
          {extractingFrames ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
          Extract frames (TikTok)
        </button>
      </div>
    );
  }

  if (!isTranscribed && transcribeFailed) {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface-hover/20 p-6 text-center space-y-4">
        <FileText size={24} className="mx-auto text-text-muted/50" />
        <p className="text-sm text-text-muted">This video could not be transcribed</p>
        <p className="mx-auto max-w-sm text-xs text-text-muted">
          Pull frames for visual analysis when possible (TikTok), or retry transcribe.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => void runExtractFrames()}
            disabled={extractingFrames || source.platform !== 'tiktok'}
            className="inline-flex items-center gap-2 rounded-lg border border-nativz-border px-3 py-2 text-xs hover:bg-surface-hover disabled:opacity-50"
          >
            {extractingFrames ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
            Extract frames
          </button>
          <button
            type="button"
            onClick={() => void runTranscribe()}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs text-white hover:opacity-90"
          >
            <FileText size={14} />
            Retry transcribe
          </button>
        </div>
      </div>
    );
  }

  if (!isTranscribed) {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface-hover/20 p-6 text-center space-y-4">
        <FileText size={24} className="mx-auto text-text-muted" />
        <p className="text-sm text-text-muted">Starting transcript…</p>
        <button
          type="button"
          onClick={() => void runExtractFrames()}
          disabled={extractingFrames || source.platform !== 'tiktok'}
          className="inline-flex items-center gap-2 rounded-lg border border-nativz-border px-3 py-2 text-xs disabled:opacity-50"
        >
          {extractingFrames ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
          Extract frames (TikTok)
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-nativz-border bg-background/40 p-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            placeholder="Search transcript…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-nativz-border bg-surface-hover/30 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        {source.transcript ? (
          <button
            type="button"
            onClick={() => handleCopy(source.transcript!)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-nativz-border px-3 py-2 text-xs text-text-muted hover:bg-surface-hover"
          >
            {copied ? <Check size={12} /> : <CopyIcon size={12} />}
            Copy
          </button>
        ) : null}
        {!hasFrames && source.platform === 'tiktok' ? (
          <button
            type="button"
            onClick={() => void runExtractFrames()}
            disabled={extractingFrames}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-nativz-border px-3 py-2 text-xs text-text-muted hover:bg-surface-hover disabled:opacity-50"
          >
            {extractingFrames ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
            Extract frames
          </button>
        ) : null}
      </div>

      {hasFrames && visionBreakdown && (
        <VisionClipBreakdownPanel breakdown={visionBreakdown} videoDurationSec={videoDurationSec} />
      )}

      {!hasFrames && !extractingFrames && hasSegments && source.platform === 'tiktok' && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-nativz-border bg-surface-hover/10 px-3 py-2">
          <ImageIcon size={12} className="shrink-0 text-text-muted" />
          <p className="flex-1 text-xs text-text-muted">
            Extract frames to see the visual timeline and AI clip breakdown alongside the transcript.
          </p>
        </div>
      )}

      {extractingFrames && (
        <div className="flex items-center gap-2 rounded-lg border border-accent/20 bg-accent-surface/30 px-3 py-2">
          <Loader2 size={12} className="shrink-0 animate-spin text-accent-text" />
          <p className="text-xs text-text-muted">Extracting frames…</p>
        </div>
      )}

      {hasFrames ? (
        <div className="max-h-[min(52vh,480px)] space-y-2 overflow-y-auto pr-1">
          {frames.map((frame, fi) => {
            const transcriptText =
              segments.length > 0
                ? getTranscriptAtTimestamp(
                    segments,
                    frame.timestamp,
                    fi < frames.length - 1 ? frames[fi + 1].timestamp - frame.timestamp : 3,
                  )
                : '';
            return (
              <div
                key={fi}
                className="flex gap-3 rounded-lg border border-nativz-border bg-surface-hover/20 p-2 transition-colors hover:border-accent/30"
              >
                <div className="relative w-[72px] shrink-0 overflow-hidden rounded-md border border-nativz-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={frame.url} alt={frame.label} className="aspect-[9/16] w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center font-mono text-[10px] text-white">
                    {frame.label}
                  </div>
                </div>
                <div className="min-w-0 flex-1 py-0.5">
                  <p className="mb-1 text-[10px] font-medium text-text-muted">
                    {frame.label}
                    {fi < frames.length - 1 ? ` – ${frames[fi + 1].label}` : '+'}
                  </p>
                  {transcriptText ? (
                    <p className="text-sm leading-relaxed text-text-secondary">
                      {searchQuery ? highlightText(transcriptText, searchQuery) : transcriptText}
                    </p>
                  ) : (
                    <p className="text-[10px] italic text-text-muted">No transcript at this point</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : hasSegments ? (
        <div className="max-h-[min(40vh,360px)] space-y-0 overflow-y-auto">
          {filteredSegments.map((seg, i) => (
            <div key={i} className="flex gap-2 rounded p-1.5 hover:bg-surface-hover/50">
              <span className="w-10 shrink-0 pt-0.5 text-right font-mono text-[10px] text-accent-text">
                {formatTimestamp(seg.start)}
              </span>
              <p className="text-sm text-text-secondary">
                {searchQuery ? highlightText(seg.text, searchQuery) : seg.text}
              </p>
            </div>
          ))}
          {filteredSegments.length === 0 && searchQuery && (
            <p className="py-4 text-center text-sm text-text-muted">No matches found</p>
          )}
        </div>
      ) : source.transcript ? (
        <div className="max-h-[min(40vh,360px)] overflow-y-auto whitespace-pre-wrap rounded-lg border border-nativz-border bg-surface-hover/30 p-4 text-sm leading-relaxed text-text-secondary">
          {highlightedTranscript ? renderHighlighted(highlightedTranscript) : source.transcript}
        </div>
      ) : null}
    </div>
  );
}
