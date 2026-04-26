'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ClientPickerButton, type ClientOption } from '@/components/ui/client-picker';
import { PLATFORM_CONFIG } from '@/components/search/platform-icon';
import type { PlatformSource } from '@/lib/types/search';
import { formatRelativeTime, formatNumber } from '@/lib/utils/format';
import { formatViewsApprox } from '@/lib/search/source-mention-utils';
import { toast } from 'sonner';
import { TopicSourceVideoBreakdown } from '@/components/results/topic-source-video-breakdown';

export interface LinkedIdeaOption {
  id: string;
  concept: string | null;
  count: number;
}

interface SourceDetailDialogProps {
  open: boolean;
  onClose: () => void;
  source: PlatformSource | null;
  searchId: string;
  defaultClientId: string | null;
  clients: ClientOption[];
  linkedIdeas: LinkedIdeaOption[];
  focusRescript?: boolean;
  onSourcePatched?: (updated: PlatformSource) => void;
}

export function SourceDetailDialog({
  open,
  onClose,
  source,
  searchId,
  defaultClientId,
  clients,
  linkedIdeas,
  focusRescript,
  onSourcePatched,
}: SourceDetailDialogProps) {
  const rescriptRef = useRef<HTMLDivElement>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [hookAnalysis, setHookAnalysis] = useState<string | null>(null);
  const [frameBreakdown, setFrameBreakdown] = useState<string | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const [rescriptClientId, setRescriptClientId] = useState<string | null>(() => defaultClientId ?? null);
  const [ideaGenId, setIdeaGenId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [rescriptLoading, setRescriptLoading] = useState(false);
  const [rescriptText, setRescriptText] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRescriptClientId(defaultClientId ?? null);
    }
    if (!open) {
      setHookAnalysis(null);
      setFrameBreakdown(null);
      setInsightsError(null);
      setRescriptText(null);
      setNotes('');
      setIdeaGenId('');
    }
  }, [open, defaultClientId]);

  useEffect(() => {
    if (!open || !source) return;
    const t = (source.transcript ?? '').trim();
    if (!t) {
      setHookAnalysis(null);
      setFrameBreakdown(null);
      setInsightsError(null);
      setInsightsLoading(false);
      return;
    }

    let cancelled = false;
    async function loadInsights() {
      setInsightsLoading(true);
      setInsightsError(null);
      try {
        const res = await fetch(`/api/search/${searchId}/sources/insights`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: source!.platform, source_id: source!.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Insights failed');
        if (cancelled) return;
        const insights = (data as { insights: { hook_analysis: string; frame_type_breakdown: string } }).insights;
        setHookAnalysis(insights.hook_analysis);
        setFrameBreakdown(insights.frame_type_breakdown);
      } catch (e) {
        if (!cancelled) setInsightsError(e instanceof Error ? e.message : 'Analysis failed');
      } finally {
        if (!cancelled) setInsightsLoading(false);
      }
    }
    void loadInsights();

    return () => {
      cancelled = true;
    };
  }, [open, searchId, source]);

  useEffect(() => {
    if (open && focusRescript && rescriptRef.current) {
      rescriptRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [open, focusRescript, source]);

  if (!source) return null;

  const src = source;

  let timeLabel = '';
  try {
    timeLabel = formatRelativeTime(src.createdAt);
  } catch {
    timeLabel = '';
  }

  const platformLabel = PLATFORM_CONFIG[src.platform]?.label ?? src.platform;
  const eng = src.engagement;
  const hasEngagement =
    eng.views != null ||
    eng.likes != null ||
    eng.comments != null ||
    (eng.shares != null && eng.shares > 0);

  const rawTitle = src.title.trim() || 'Source details';
  const dialogTitleDisplay = rawTitle.length > 120 ? `${rawTitle.slice(0, 120)}…` : rawTitle;

  async function runRescript() {
    if (!rescriptClientId) {
      toast.error('Select a client for brand context');
      return;
    }
    setRescriptLoading(true);
    try {
      const res = await fetch(`/api/search/${searchId}/sources/rescript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: src.platform,
          source_id: src.id,
          client_id: rescriptClientId,
          notes: notes.trim() || undefined,
          idea_generation_id: ideaGenId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setRescriptText((data.script as string) ?? '');
      toast.success('Script ready');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setRescriptLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={dialogTitleDisplay}
      maxWidth="5xl"
      className="max-h-[min(92vh,900px)] overflow-hidden flex flex-col"
      bodyClassName="p-6 flex flex-col min-h-0 max-h-[min(88vh,860px)] overflow-y-auto"
    >
      <div className="space-y-6 text-sm text-text-secondary">
        <div className="flex flex-wrap items-start justify-between gap-4 text-text-primary">
          <div className="flex flex-wrap gap-4">
            <div>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Platform</p>
              <p className="mt-0.5">{platformLabel}</p>
            </div>
            {timeLabel ? (
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Post date</p>
                <p className="mt-0.5">{timeLabel}</p>
              </div>
            ) : null}
          </div>
          <a
            href={src.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-accent-text hover:underline shrink-0"
          >
            Open on platform
          </a>
        </div>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Analytics</h4>
          <div className="flex flex-wrap gap-3 text-text-primary">
            {eng.views != null && <span>Est. views {formatViewsApprox(eng.views)}</span>}
            {eng.likes != null && <span>Likes {formatNumber(eng.likes)}</span>}
            {eng.comments != null && <span>Comments {formatNumber(eng.comments)}</span>}
            {eng.shares != null && eng.shares > 0 && <span>Shares {formatNumber(eng.shares)}</span>}
            {!hasEngagement && (
              <span className="text-text-muted">No engagement metrics for this source.</span>
            )}
          </div>
        </section>

        {(src.platform === 'tiktok' || src.platform === 'youtube') && (
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">
              Video breakdown
            </h4>
            <p className="text-xs text-text-muted mb-3">
              Transcript, FFmpeg keyframes, and AI visual clip analysis — same pipeline as mood board video analysis.
              Frame extraction in research is TikTok-only; YouTube gets captions and text timeline.
            </p>
            <TopicSourceVideoBreakdown
              searchId={searchId}
              source={src}
              onSourcePatched={onSourcePatched}
            />
          </section>
        )}

        {src.platform !== 'tiktok' && src.platform !== 'youtube' ? (
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Original script</h4>
            {src.transcript?.trim() ? (
              <pre className="whitespace-pre-wrap rounded-lg border border-nativz-border bg-background/80 p-3 text-xs leading-relaxed max-h-48 overflow-y-auto">
                {src.transcript}
              </pre>
            ) : (
              <p className="text-text-muted text-sm">No transcript captured for this source.</p>
            )}
          </section>
        ) : null}

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Hook analysis</h4>
          {insightsLoading ? (
            <div className="flex items-center gap-2 text-text-muted">
              <Loader2 className="animate-spin size-4" />
              Analyzing…
            </div>
          ) : insightsError && !hookAnalysis ? (
            <p className="text-text-muted text-sm">{insightsError}</p>
          ) : (
            <p className="leading-relaxed">{hookAnalysis ?? '—'}</p>
          )}
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Frame type breakdown</h4>
          {insightsLoading ? (
            <div className="flex items-center gap-2 text-text-muted">
              <Loader2 className="animate-spin size-4" />
              Analyzing…
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{frameBreakdown ?? '—'}</pre>
          )}
        </section>

        <section ref={rescriptRef} className="rounded-xl border border-accent/25 bg-accent/5 p-4 space-y-4">
          <div className="flex items-center gap-2 text-text-primary">
            <Sparkles className="size-4 text-accent-text shrink-0" />
            <h4 className="text-sm font-semibold">Analyze</h4>
          </div>
          <p className="text-xs text-text-muted">
            Uses the attached client when this search is client-scoped; otherwise pick a client. Optionally anchor
            the rewrite to one of your generated idea sets from this research.
          </p>
          <div className="space-y-2">
            <p className="text-xs font-medium text-text-muted">Client</p>
            <ClientPickerButton
              clients={clients}
              value={rescriptClientId}
              onChange={setRescriptClientId}
              placeholder="Select a client"
            />
          </div>
          {linkedIdeas.length > 0 ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-text-muted" htmlFor="idea-gen-select">
                Use generated ideas (optional)
              </label>
              <select
                id="idea-gen-select"
                className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
                value={ideaGenId}
                onChange={(e) => setIdeaGenId(e.target.value)}
              >
                <option value="">New video — no idea set</option>
                {linkedIdeas.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.concept ? `${g.concept} (${g.count} ideas)` : `${g.count} ideas`}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="space-y-2">
            <label className="text-xs font-medium text-text-muted" htmlFor="rescript-notes">
              Notes (optional)
            </label>
            <textarea
              id="rescript-notes"
              className="w-full min-h-[72px] rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm"
              placeholder="Tone, offer, CTA, or angles…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="primary"
            className="gap-2"
            disabled={rescriptLoading || !src.transcript?.trim()}
            onClick={() => void runRescript()}
          >
            {rescriptLoading ? <Loader2 className="animate-spin size-4" /> : <Sparkles className="size-4" />}
            Analyze
          </Button>
          {rescriptText ? (
            <div>
              <p className="text-xs font-medium text-text-muted mb-2">Generated script</p>
              <pre className="whitespace-pre-wrap rounded-lg border border-nativz-border bg-surface p-3 text-sm leading-relaxed max-h-64 overflow-y-auto">
                {rescriptText}
              </pre>
            </div>
          ) : null}
        </section>
      </div>
    </Dialog>
  );
}
