'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Globe, Palette, MessageSquare, ShoppingBag, FileText, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

const STAGES = [
  { key: 'crawling', label: 'Crawling website', icon: Globe },
  { key: 'extracting', label: 'Extracting visual identity', icon: Palette },
  { key: 'analyzing', label: 'Analyzing tone of voice', icon: MessageSquare },
  { key: 'analyzing-products', label: 'Building product catalog', icon: ShoppingBag },
  { key: 'compiling', label: 'Compiling brand guideline', icon: FileText },
];

interface BrandDNAProgressProps {
  clientId: string;
  onComplete: () => void;
  /** Modal only: close UI while the server keeps generating */
  onContinueInBackground?: () => void;
  /** Extra line under the title (e.g. “You can use other pages…”) */
  navigateAwayHint?: string;
}

export function BrandDNAProgress({
  clientId,
  onComplete,
  onContinueInBackground,
  navigateAwayHint,
}: BrandDNAProgressProps) {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [stepLabel, setStepLabel] = useState('Starting...');
  const [status, setStatus] = useState('queued');
  const [error, setError] = useState('');
  const [isStale, setIsStale] = useState(false);
  const [staleHint, setStaleHint] = useState<string | null>(null);
  const [aborting, setAborting] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasCompleted = useRef(false);

  useEffect(() => {
    if (!clientId) return;

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/brand-dna/status`);
        if (!res.ok) return;
        const data = await res.json();

        setProgress(data.progress_pct ?? 0);
        setStepLabel(data.step_label ?? 'Processing...');
        setStatus(data.status ?? 'queued');
        setIsStale(data.is_stale === true);
        setStaleHint(typeof data.stale_hint === 'string' ? data.stale_hint : null);

        if (data.status === 'completed' && !hasCompleted.current) {
          hasCompleted.current = true;
          if (pollingRef.current) clearInterval(pollingRef.current);
          setTimeout(() => onComplete(), 800);
        }

        if (data.status === 'failed') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setError(data.error_message ?? 'Generation failed');
        }
      } catch {
        // Silently retry
      }
    }, 2000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [clientId, onComplete]);

  const currentStageIdx = STAGES.findIndex((s) => {
    if (status === 'crawling') return s.key === 'crawling';
    if (status === 'extracting') return s.key === 'extracting';
    if (status === 'analyzing' && progress < 65) return s.key === 'analyzing';
    if (status === 'analyzing' && progress >= 65) return s.key === 'analyzing-products';
    if (status === 'compiling') return s.key === 'compiling';
    return false;
  });

  const awayCopy =
    navigateAwayHint ??
    (onContinueInBackground
      ? 'This runs on the server — you can use other admin pages and come back when it’s done.'
      : null);

  return (
    <div className="text-center">
      <h2 className="text-lg font-semibold text-text-primary mb-1">Building Brand DNA</h2>
      <p className="text-sm text-text-muted mb-1">
        This usually takes a few minutes; large sites or slow models can take longer.
      </p>
      {awayCopy ? (
        <p className="text-xs text-text-muted/90 mb-4 max-w-sm mx-auto leading-relaxed">{awayCopy}</p>
      ) : (
        <div className="mb-5" aria-hidden />
      )}
      {onContinueInBackground && (
        <div className="mb-5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-text-secondary"
            onClick={onContinueInBackground}
          >
            Continue in background
          </Button>
        </div>
      )}

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-surface/60 overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${progress}%`,
            background: 'linear-gradient(90deg, var(--accent), var(--accent2))',
          }}
        />
      </div>
      <p className="text-xs text-text-muted text-right tabular-nums mb-1">{Math.round(progress)}%</p>
      {stepLabel ? (
        <p className="text-xs text-text-muted/90 text-center mb-5 max-w-sm mx-auto leading-snug">
          {stepLabel}
        </p>
      ) : (
        <div className="mb-5" aria-hidden />
      )}

      {isStale && (
        <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-left">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-400 mt-0.5 shrink-0" />
            <div className="min-w-0 space-y-2">
              <p className="text-xs font-medium text-amber-200/95">This run looks stuck</p>
              <p className="text-xs text-text-muted leading-relaxed">
                {staleHint ??
                  'No progress updates for a while. You can reset the job and start generation again.'}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-amber-500/30 text-text-secondary"
                disabled={aborting}
                onClick={async () => {
                  setAborting(true);
                  try {
                    const res = await fetch(`/api/clients/${clientId}/brand-dna/abort-stuck`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({}),
                    });
                    const body = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      toast.error(
                        typeof body.error === 'string' ? body.error : 'Could not reset the job',
                      );
                      return;
                    }
                    toast.success('Job reset — you can generate Brand DNA again');
                    router.refresh();
                  } finally {
                    setAborting(false);
                  }
                }}
              >
                {aborting ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Resetting…
                  </>
                ) : (
                  'Reset stuck job'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Stage steps */}
      <div className="space-y-2.5 text-left">
        {STAGES.map((stage, i) => {
          const isComplete = i < currentStageIdx || status === 'completed';
          const isCurrent = i === currentStageIdx && status !== 'completed' && !error;
          const isVisible = isComplete || isCurrent;

          if (!isVisible) return null;

          const Icon = stage.icon;
          return (
            <div key={stage.key} className="flex items-center gap-2.5 animate-fade-slide-in">
              {isComplete ? (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15">
                  <Check size={12} className="text-accent" />
                </div>
              ) : (
                <div className="flex h-5 w-5 items-center justify-center">
                  <Loader2 size={14} className="animate-spin text-accent2-text" />
                </div>
              )}
              <Icon size={14} className={isComplete ? 'text-text-muted' : 'text-text-secondary'} />
              <span className={`text-sm ${isComplete ? 'text-text-muted' : 'text-text-primary font-medium'}`}>
                {stage.label}
              </span>
            </div>
          );
        })}

        {status === 'completed' && (
          <div className="flex items-center gap-2.5 animate-fade-slide-in">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15">
              <Check size={12} className="text-emerald-400" />
            </div>
            <span className="text-sm text-emerald-400 font-medium">Brand DNA ready</span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-left">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-red-400">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => window.location.reload()}
              >
                Try again
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
