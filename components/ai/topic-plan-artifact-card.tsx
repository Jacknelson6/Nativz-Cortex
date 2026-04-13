'use client';

import { FileText, Download, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Inline artifact card shown when the Nerd has just called create_topic_plan.
 * This is the "deliverable" UI — the chat response itself should be a tight
 * one-line summary; this card is where the user picks up the actual document.
 */

export interface TopicPlanArtifactData {
  id: string;
  title: string;
  subtitle?: string | null;
  client_name?: string | null;
  series_count?: number;
  total_ideas?: number;
  high_resonance_count?: number;
  download_url: string;
  created_at?: string;
}

export function TopicPlanArtifactCard({ data }: { data: TopicPlanArtifactData }) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(data.download_url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Download failed' }));
        toast.error(body.error ?? 'Download failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeTitle = data.title.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'topic_plan';
      a.download = `${safeTitle}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Downloaded');
    } catch {
      toast.error('Download failed');
    } finally {
      setDownloading(false);
    }
  }

  const stats = [
    data.series_count != null ? `${data.series_count} ${data.series_count === 1 ? 'series' : 'series'}` : null,
    data.total_ideas != null ? `${data.total_ideas} ${data.total_ideas === 1 ? 'idea' : 'ideas'}` : null,
    data.high_resonance_count ? `${data.high_resonance_count} high resonance` : null,
  ].filter(Boolean);

  return (
    <div className="my-3 rounded-xl border border-accent/25 bg-gradient-to-br from-accent/[0.06] to-accent/[0.02] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
          <FileText size={20} className="text-accent-text" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-accent-text">
              Topic plan · deliverable
            </span>
            <CheckCircle2 size={12} className="text-emerald-400" />
          </div>
          <h4 className="mt-0.5 text-base font-semibold text-text-primary truncate">
            {data.title}
          </h4>
          {data.subtitle && (
            <p className="mt-0.5 text-sm text-text-secondary line-clamp-2">{data.subtitle}</p>
          )}
          {stats.length > 0 && (
            <p className="mt-1 text-xs text-text-muted">
              {data.client_name ? `${data.client_name}  ·  ` : ''}
              {stats.join('  ·  ')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download size={14} />
          {downloading ? 'Downloading…' : 'Download PDF'}
        </button>
      </div>
    </div>
  );
}
