'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Clock, Sparkles, Globe, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { BrandDNACards, BRAND_DNA_BENTO_SURFACE } from './brand-dna-cards';
import { OnboardWizard } from './onboard-wizard';
import { BrandDNAProgress } from './brand-dna-progress';
import { BrandDNASectionEditor } from './brand-dna-section-editor';
import { Markdown } from '@/components/ai/markdown';
import { formatRelativeTime } from '@/lib/utils/format';
import type { BrandGuidelineMetadata } from '@/lib/knowledge/types';
import { useClientAdminShell } from '@/components/clients/client-admin-shell-context';
import { useBrandMode } from '@/components/layout/brand-mode-provider';

interface BrandDNAViewProps {
  clientId: string;
  clientName: string;
  clientSlug: string;
  websiteUrl: string;
  brandDnaStatus: string;
  guideline: {
    id: string;
    content: string;
    metadata: unknown;
    created_at: string;
    updated_at: string;
  } | null;
}

export function BrandDNAView({
  clientId,
  clientName,
  clientSlug,
  websiteUrl,
  brandDnaStatus,
  guideline,
}: BrandDNAViewProps) {
  const shell = useClientAdminShell();
  const router = useRouter();
  const { mode: brandMode } = useBrandMode();
  const isAC = brandMode === 'anderson';
  const [generateOpen, setGenerateOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [localMetadata, setLocalMetadata] = useState<BrandGuidelineMetadata | null>(
    (guideline?.metadata as BrandGuidelineMetadata) ?? null
  );

  const metadata = (localMetadata ?? guideline?.metadata ?? null) as Record<string, unknown> | null;

  /** Refresh hits the same pipeline as generate — only offer it once a kit exists (not on empty state). */
  const canRegenerateBrandDna =
    websiteUrl.trim().length > 0 &&
    brandDnaStatus !== 'generating' &&
    guideline != null;

  function handleSectionSaved(updated: Partial<BrandGuidelineMetadata>) {
    setLocalMetadata((prev) => prev ? { ...prev, ...updated } : (updated as BrandGuidelineMetadata));
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/brand-dna/refresh`, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Refresh failed');
      }
      toast.success('Regenerating brand DNA — you can leave this page; refresh when it finishes');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start regeneration');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="cortex-page-gutter max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!shell && (
            <Link
              href={`/admin/clients/${clientSlug}`}
              className="text-text-muted hover:text-text-secondary transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
          )}
          <div>
            <h1 className="ui-page-title-md">
              {clientName.trim() ? `${clientName.trim()} brand DNA` : 'Brand DNA'}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {guideline && (
            <span className="text-xs text-text-muted flex items-center gap-1">
              <Clock size={12} />
              Updated {formatRelativeTime(guideline.updated_at ?? guideline.created_at)}
            </span>
          )}
          {canRegenerateBrandDna ? (
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Regenerating…' : 'Regenerate brand DNA'}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Brand DNA content or empty state */}
      {brandDnaStatus === 'generating' ? (
        <div className="rounded-xl border border-nativz-border bg-surface p-8">
          <BrandDNAProgress
            clientId={clientId}
            onComplete={() => router.refresh()}
          />
        </div>
      ) : guideline && metadata ? (
        <>
          {/* Bento grid cards */}
          <BrandDNACards
            metadata={metadata}
            clientId={clientId}
            editable
            onEditSection={setEditingSection}
          />

          {/* Full guideline document */}
          <div className={`${BRAND_DNA_BENTO_SURFACE} p-3 sm:p-4`}>
            <h3 className="mb-3 text-sm font-semibold text-text-primary">Full brand guideline</h3>
            <div className={`prose ${isAC ? '' : 'prose-invert'} prose-sm max-w-none text-text-secondary`}>
              <Markdown content={guideline.content} />
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-surface mb-4">
            <Sparkles size={28} className="text-accent-text" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">No Brand DNA yet</h2>
          <p className="text-sm text-text-muted mb-6 max-w-md">
            Generate a comprehensive brand guideline from {clientName}&apos;s website.
            This becomes the source of truth for all AI-powered content generation.
          </p>
          {!websiteUrl.trim() && (
            <p className="text-xs text-text-muted mb-4 max-w-md">
              Add a website URL on the client profile before generating Brand DNA.
            </p>
          )}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button onClick={() => setGenerateOpen(true)}>
              <Globe size={14} />
              Generate Brand DNA
            </Button>
          </div>
        </div>
      )}

      {/* Generate wizard for existing clients */}
      <OnboardWizard
        open={generateOpen}
        onClose={() => { setGenerateOpen(false); router.refresh(); }}
        existingClientId={clientId}
        existingClientName={clientName}
      />

      {/* Section editor */}
      {editingSection && metadata && (
        <BrandDNASectionEditor
          section={editingSection}
          clientId={clientId}
          metadata={metadata as unknown as BrandGuidelineMetadata}
          open={!!editingSection}
          onClose={() => setEditingSection(null)}
          onSaved={handleSectionSaved}
        />
      )}
    </div>
  );
}
