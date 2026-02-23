'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, RefreshCw, Loader2, Sparkles, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GlassButton } from '@/components/ui/glass-button';
import { formatRelativeTime } from '@/lib/utils/format';
import type { ClientStrategy } from '@/lib/types/strategy';

interface ClientStrategyCardProps {
  clientId: string;
  clientName: string;
  initialStrategy: ClientStrategy | null;
}

const POLL_INTERVAL = 4000;

export function ClientStrategyCard({ clientId, clientName, initialStrategy }: ClientStrategyCardProps) {
  const [strategy, setStrategy] = useState<ClientStrategy | null>(initialStrategy);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isProcessing = generating || strategy?.status === 'processing';

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/strategy`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'completed' || data.status === 'failed') {
          setStrategy(data);
          setGenerating(false);
          stopPolling();
          if (data.status === 'completed') {
            toast.success('Content strategy generated');
          } else {
            toast.error('Strategy generation failed');
          }
        }
      } catch {
        // Silently retry on next interval
      }
    }, POLL_INTERVAL);
  }, [clientId, stopPolling]);

  // Start polling on mount if strategy is already processing
  useEffect(() => {
    if (strategy?.status === 'processing') {
      startPolling();
    }
    return stopPolling;
  }, [strategy?.status, startPolling, stopPolling]);

  async function handleGenerate() {
    setGenerating(true);
    startPolling();
    try {
      const res = await fetch(`/api/clients/${clientId}/strategy`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Strategy generation failed');
        setGenerating(false);
        stopPolling();
        return;
      }
      // POST completed — fetch the result directly
      const stratRes = await fetch(`/api/clients/${clientId}/strategy`);
      if (stratRes.ok) {
        const data = await stratRes.json();
        setStrategy(data);
        if (data.status === 'completed') {
          toast.success('Content strategy generated');
          setGenerating(false);
          stopPolling();
        }
        // If still processing, polling will continue
      }
    } catch {
      toast.error('Something went wrong. Try again.');
      setGenerating(false);
      stopPolling();
    }
  }

  async function handleDownloadPdf() {
    if (!strategy) return;
    const { pdf } = await import('@react-pdf/renderer');
    const { StrategyPdf } = await import('@/components/onboard/strategy-pdf');
    const React = await import('react');

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = React.createElement(StrategyPdf, { strategy, clientName }) as any;
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-content-strategy.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('PDF generation failed');
    }
  }

  // No strategy yet or strategy failed
  if (!strategy || (strategy.status === 'failed' && !isProcessing)) {
    return (
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-text-primary">Content strategy</h2>
        </div>
        {isProcessing ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 mb-3">
              <Loader2 size={20} className="text-accent animate-spin" />
            </div>
            <p className="text-sm text-text-secondary mb-1">Generating strategy...</p>
            <p className="text-xs text-text-muted">
              Researching trends and building a content plan for {clientName}. This usually takes 1–2 minutes.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 mb-3">
              <FileText size={20} className="text-accent" />
            </div>
            <p className="text-sm text-text-secondary mb-1">
              {strategy?.status === 'failed' ? 'Strategy generation failed' : 'No strategy generated yet'}
            </p>
            <p className="text-xs text-text-muted mb-4">
              {strategy?.status === 'failed'
                ? 'Something went wrong. Try generating again.'
                : `Generate an AI content strategy based on ${clientName}'s brand profile and market trends.`}
            </p>
            <GlassButton onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {generating ? 'Generating...' : 'Generate content strategy'}
            </GlassButton>
          </div>
        )}
      </Card>
    );
  }

  // Strategy exists (processing or completed)
  const pillarsCount = (strategy.content_pillars ?? []).length;
  const ideasCount = (strategy.video_ideas ?? []).length;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-text-primary">Content strategy</h2>
          {isProcessing && (
            <Badge variant="info">
              <span className="flex items-center gap-1.5">
                <Loader2 size={10} className="animate-spin" />
                Processing
              </span>
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {strategy.status === 'completed' && (
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
              <Download size={12} />
              PDF
            </Button>
          )}
          {!isProcessing && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={generating}
            >
              <RefreshCw size={12} />
              Regenerate
            </Button>
          )}
        </div>
      </div>

      {/* Processing state */}
      {isProcessing && (
        <div className="flex items-center gap-3 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 mb-3">
          <Loader2 size={16} className="text-accent animate-spin shrink-0" />
          <div>
            <p className="text-sm text-text-secondary">Generating content strategy...</p>
            <p className="text-xs text-text-muted">Researching trends and building a plan. This usually takes 1–2 minutes.</p>
          </div>
        </div>
      )}

      {/* Summary */}
      {strategy.executive_summary && (
        <p className="text-sm text-text-secondary leading-relaxed mb-3 line-clamp-3">
          {strategy.executive_summary}
        </p>
      )}

      {/* Quick stats */}
      {(pillarsCount > 0 || ideasCount > 0) && (
        <div className="flex flex-wrap gap-3 mb-3">
          {pillarsCount > 0 && (
            <span className="text-xs text-text-muted">
              {pillarsCount} content pillar{pillarsCount !== 1 ? 's' : ''}
            </span>
          )}
          {ideasCount > 0 && (
            <span className="text-xs text-text-muted">
              {ideasCount} video idea{ideasCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Expandable details */}
      {strategy.status === 'completed' && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="cursor-pointer flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Show less' : 'Show details'}
          </button>

          {expanded && (
            <div className="mt-3 space-y-3 pt-3 border-t border-nativz-border animate-fade-in">
              {/* Content pillars */}
              {(strategy.content_pillars ?? []).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Content pillars</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(strategy.content_pillars ?? []).map((p, i) => (
                      <Badge key={i} variant="default">{p.pillar}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Top video ideas */}
              {(strategy.video_ideas ?? []).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Top video ideas</p>
                  <div className="space-y-1.5">
                    {(strategy.video_ideas ?? []).slice(0, 4).map((v, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-text-secondary">
                        <span className="text-text-muted tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                        <span className="truncate">{v.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <p className="text-[10px] text-text-muted mt-3">
        {isProcessing
          ? `Started ${formatRelativeTime(strategy.created_at)}`
          : `Generated ${formatRelativeTime(strategy.completed_at ?? strategy.created_at)}`
        }
      </p>
    </Card>
  );
}
