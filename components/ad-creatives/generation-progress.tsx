'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AdGenerationBatch, AdCreative } from '@/lib/ad-creatives/types';
import { sortAdCreativesForBatch } from '@/lib/ad-creatives/sort-creatives';

interface GenerationProgressProps {
  clientId: string;
  batchId: string;
  onComplete: () => void;
}

export function GenerationProgress({ clientId, batchId, onComplete }: GenerationProgressProps) {
  const [batch, setBatch] = useState<AdGenerationBatch | null>(null);
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/clients/${clientId}/ad-creatives/batches/${batchId}`,
      );
      if (!res.ok) {
        setError('Failed to check progress');
        return;
      }
      const data = await res.json();
      setBatch(data.batch ?? null);
      setCreatives(sortAdCreativesForBatch(data.creatives ?? []));

      // Stop polling when done
      const status = data.batch?.status;
      if (
        status === 'completed' ||
        status === 'failed' ||
        status === 'partial' ||
        status === 'cancelled'
      ) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    } catch {
      setError('Failed to check progress');
    }
  }, [clientId, batchId]);

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll]);

  const total = batch?.total_count ?? 0;
  const completed = batch?.completed_count ?? 0;
  const failed = batch?.failed_count ?? 0;
  const progress = total > 0 ? (completed / total) * 100 : 0;
  const isDone =
    batch?.status === 'completed' ||
    batch?.status === 'partial' ||
    batch?.status === 'failed' ||
    batch?.status === 'cancelled';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Status card */}
      <div className="rounded-xl border border-nativz-border bg-surface p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          {isDone ? (
            batch?.status === 'failed' ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
            ) : batch?.status === 'cancelled' ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15">
                <AlertTriangle size={20} className="text-amber-400" />
              </div>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
                <CheckCircle2 size={20} className="text-emerald-400" />
              </div>
            )
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-surface">
              <Loader2 size={20} className="text-accent-text animate-spin" />
            </div>
          )}
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              {isDone
                ? batch?.status === 'failed'
                  ? 'Generation failed'
                  : batch?.status === 'cancelled'
                    ? 'Generation stopped'
                    : 'All done!'
                : `Generating creative ${completed + 1} of ${total}...`}
            </h2>
            {isDone && completed > 0 && failed > 0 && (
              <p className="text-xs text-amber-400 flex items-center gap-1 mt-0.5">
                <AlertTriangle size={12} />
                {completed} creative{completed !== 1 ? 's' : ''} generated, {failed} failed
              </p>
            )}
            {isDone && failed === 0 && completed > 0 && batch?.status !== 'cancelled' && (
              <p className="text-xs text-text-muted mt-0.5">
                {completed} creative{completed !== 1 ? 's' : ''} generated successfully
              </p>
            )}
            {isDone && batch?.status === 'cancelled' && (
              <p className="text-xs text-text-muted mt-0.5">
                {completed > 0
                  ? `${completed} creative${completed !== 1 ? 's' : ''} saved before stop. In-flight images may still appear shortly.`
                  : 'No new creatives were saved. In-flight images may still appear shortly.'}
              </p>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-background overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                batch?.status === 'failed'
                  ? 'bg-red-500'
                  : batch?.status === 'cancelled'
                    ? 'bg-amber-500'
                    : isDone
                      ? 'bg-emerald-500'
                      : 'bg-accent'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">
              {completed} / {total} completed
            </span>
            <span className="text-xs text-text-muted">
              {Math.round(progress)}%
            </span>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        {/* CTA when done */}
        {isDone && completed > 0 && (
          <Button onClick={onComplete} className="w-full">
            View gallery
            <ArrowRight size={14} />
          </Button>
        )}

        {isDone && completed === 0 && batch?.status !== 'cancelled' && (
          <Button variant="outline" onClick={onComplete} className="w-full">
            Back to generator
          </Button>
        )}

        {isDone && completed === 0 && batch?.status === 'cancelled' && (
          <Button variant="outline" onClick={onComplete} className="w-full">
            View gallery
            <ArrowRight size={14} />
          </Button>
        )}
      </div>

      {/* Completed creative thumbnails */}
      {creatives.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">
            Generated creatives
          </h3>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {creatives.map((creative, i) => (
              <div
                key={creative.id}
                className="rounded-lg overflow-hidden border border-nativz-border bg-surface animate-[fadeIn_300ms_ease-out]"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <img
                  src={creative.image_url}
                  alt={creative.on_screen_text?.headline ?? 'Creative'}
                  className="w-full aspect-square object-cover"
                  loading="lazy"
                />
              </div>
            ))}

            {/* Placeholder slots for pending creatives */}
            {!isDone &&
              Array.from({ length: Math.max(0, total - creatives.length) }).map((_, i) => (
                <div
                  key={`pending-${i}`}
                  className="rounded-lg border border-nativz-border bg-surface aspect-square flex items-center justify-center"
                >
                  <div className="animate-pulse h-3 w-3 rounded-full bg-white/[0.08]" />
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
