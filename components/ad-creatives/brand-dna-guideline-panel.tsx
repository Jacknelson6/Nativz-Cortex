'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, FileText } from 'lucide-react';
import { Markdown } from '@/components/ai/markdown';
import { BRAND_DNA_BENTO_SURFACE } from '@/components/brand-dna/brand-dna-cards';

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
    <div className={`${BRAND_DNA_BENTO_SURFACE} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.04] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileText size={14} className="shrink-0 text-text-muted" />
          <p className="truncate text-xs font-medium text-text-primary">Full brand guideline</p>
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
