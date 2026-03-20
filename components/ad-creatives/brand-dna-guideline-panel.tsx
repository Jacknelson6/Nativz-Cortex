'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, FileText } from 'lucide-react';
import { Markdown } from '@/components/ai/markdown';

interface BrandDnaGuidelinePanelProps {
  clientId: string;
  clientSlug?: string;
}

/**
 * Loads the active brand guideline markdown and shows it inline (ad wizard brand step).
 */
export function BrandDnaGuidelinePanel({ clientId, clientSlug }: BrandDnaGuidelinePanelProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/clients/${clientId}/brand-dna`);
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error ?? 'Failed to load guideline');
        }
        const data = (await res.json()) as { content?: string };
        if (!cancelled) setContent(typeof data.content === 'string' ? data.content : '');
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-background/50 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5 bg-white/[0.03]">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={14} className="text-accent-text shrink-0" />
          <p className="text-xs font-medium text-text-primary truncate">Full brand guideline</p>
          <span className="text-[10px] text-text-muted hidden sm:inline">(same document as Brand DNA)</span>
        </div>
        {clientSlug ? (
          <Link
            href={`/admin/clients/${clientSlug}/brand-dna`}
            className="text-[11px] font-medium text-accent-text hover:underline shrink-0"
          >
            Edit in Brand DNA
          </Link>
        ) : null}
      </div>
      <div className="max-h-[min(58vh,520px)] overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-width:thin]">
        {loading && (
          <div className="flex items-center gap-2 text-xs text-text-muted py-6 justify-center">
            <Loader2 size={14} className="animate-spin text-accent-text" />
            Loading full guideline…
          </div>
        )}
        {err && <p className="text-xs text-red-400 py-2">{err}</p>}
        {!loading && !err && content !== null && (
          <div className="text-text-secondary [&_h2]:scroll-mt-2 [&_h3]:scroll-mt-2">
            <Markdown content={content} />
          </div>
        )}
      </div>
    </div>
  );
}
