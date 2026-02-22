'use client';

import { useState, useEffect } from 'react';
import { FileText, Download, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/utils/format';
import type { ClientStrategy } from '@/lib/types/strategy';

interface PortalStrategyCardProps {
  clientId: string;
  clientName: string;
}

export function PortalStrategyCard({ clientId, clientName }: PortalStrategyCardProps) {
  const [strategy, setStrategy] = useState<ClientStrategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    async function fetchStrategy() {
      try {
        const res = await fetch(`/api/clients/${clientId}/strategy`);
        if (res.ok) {
          const data = await res.json();
          setStrategy(data);
        }
      } catch {
        // No strategy available
      } finally {
        setLoading(false);
      }
    }
    fetchStrategy();
  }, [clientId]);

  async function handleDownloadPdf() {
    if (!strategy) return;
    setDownloading(true);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { StrategyPdf } = await import('@/components/onboard/strategy-pdf');
      const React = await import('react');
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
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <div className="flex items-center gap-3 py-6 justify-center">
          <Loader2 size={16} className="animate-spin text-text-muted" />
          <span className="text-sm text-text-muted">Loading strategy...</span>
        </div>
      </Card>
    );
  }

  if (!strategy) return null;

  const pillarsCount = (strategy.content_pillars ?? []).length;
  const ideasCount = (strategy.video_ideas ?? []).length;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-accent" />
          <h2 className="text-base font-semibold text-text-primary">Content strategy</h2>
          <Badge variant="success">Ready</Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadPdf}
          disabled={downloading}
        >
          {downloading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Download size={12} />
          )}
          {downloading ? 'Generating...' : 'Download PDF'}
        </Button>
      </div>

      {strategy.executive_summary && (
        <p className="text-sm text-text-secondary leading-relaxed mb-3 line-clamp-3">
          {strategy.executive_summary}
        </p>
      )}

      <div className="flex flex-wrap gap-3 mb-3 text-xs text-text-muted">
        {pillarsCount > 0 && <span>{pillarsCount} content pillar{pillarsCount !== 1 ? 's' : ''}</span>}
        {ideasCount > 0 && <span>{ideasCount} video idea{ideasCount !== 1 ? 's' : ''}</span>}
      </div>

      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {expanded ? 'Show less' : 'View highlights'}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 pt-3 border-t border-nativz-border animate-fade-in">
          {(strategy.content_pillars ?? []).length > 0 && (
            <div>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Content pillars</p>
              <div className="space-y-2">
                {(strategy.content_pillars ?? []).map((p, i) => (
                  <div key={i} className="rounded-lg border border-nativz-border-light px-3 py-2">
                    <p className="text-sm font-medium text-text-primary">{p.pillar}</p>
                    <p className="text-xs text-text-muted mt-0.5">{p.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(strategy.video_ideas ?? []).length > 0 && (
            <div>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Video ideas</p>
              <div className="space-y-1.5">
                {(strategy.video_ideas ?? []).slice(0, 6).map((v, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-text-muted tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-text-primary flex-1 truncate">{v.title}</span>
                    <span className="text-text-muted shrink-0">{v.format}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(strategy.next_steps ?? []).length > 0 && (
            <div>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Next steps</p>
              <div className="space-y-1">
                {(strategy.next_steps ?? []).filter(s => s.priority === 'high').map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <Badge variant="warning" className="mt-0.5 shrink-0 text-[9px]">high</Badge>
                    <span className="text-text-secondary">{s.action}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-text-muted mt-3">
        Generated {formatRelativeTime(strategy.completed_at ?? strategy.created_at)}
      </p>
    </Card>
  );
}
