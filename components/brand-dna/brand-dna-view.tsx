'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandDNACards } from './brand-dna-cards';
import { OnboardWizard } from './onboard-wizard';
import { BrandDNAProgress } from './brand-dna-progress';
import { BrandDNASectionEditor } from './brand-dna-section-editor';
import type { BrandGuidelineMetadata } from '@/lib/knowledge/types';

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
  /** Viewer mode — same layout/tokens, no per-section pencils, no
   *  Generate-Brand-DNA wizard, friendlier empty state. */
  editable?: boolean;
}

export function BrandDNAView({
  clientId,
  clientName,
  clientSlug,
  websiteUrl,
  brandDnaStatus,
  guideline,
  editable = true,
}: BrandDNAViewProps) {
  const router = useRouter();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [localMetadata, setLocalMetadata] = useState<BrandGuidelineMetadata | null>(
    (guideline?.metadata as BrandGuidelineMetadata) ?? null
  );

  const metadata = (localMetadata ?? guideline?.metadata ?? null) as Record<string, unknown> | null;

  // NAT-57 follow-up (polish pass 2): Regenerate-brand-DNA wholesale
  // flow removed. Admins edit individual sections (fonts, colors,
  // products, voice, etc.) via the per-tile pencil icons, which open
  // BrandDNASectionEditor — that's where font + color uploads happen.
  // `handleSectionSaved` below still fires when an individual section
  // save succeeds.

  function handleSectionSaved(updated: Partial<BrandGuidelineMetadata>) {
    setLocalMetadata((prev) => prev ? { ...prev, ...updated } : (updated as BrandGuidelineMetadata));
  }

  return (
    <div className="space-y-6">
      {/* NAT-57 follow-up (polish pass 3, 2026-04-21): the internal
          "[Brand name] brand DNA" header + back-arrow + "Updated X days
          ago" timestamp were removed. This component is now always
          rendered inside an outer SectionCard (on /brand-profile
          and the settings page) which provides its own title, icon,
          and description — so repeating it here was redundant signage.
          Back-arrow was only useful when DNA had its own full-page
          route; that route is gone. */}

      {/* Brand DNA content or empty state */}
      {brandDnaStatus === 'generating' ? (
        <div className="rounded-xl border border-nativz-border bg-surface p-8">
          <BrandDNAProgress
            clientId={clientId}
            onComplete={() => router.refresh()}
          />
        </div>
      ) : guideline && metadata ? (
        /* NAT-57 follow-up (polish pass 3): "Full brand guideline"
           markdown dump hidden. Jack's preference — the bento cards
           are the canonical surface; the full guideline is
           admin-internal noise for this view. Content still lives
           in client_knowledge_entries if we need it elsewhere. */
        <BrandDNACards
          metadata={metadata}
          clientId={clientId}
          editable={editable}
          onEditSection={editable ? setEditingSection : undefined}
        />
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-surface mb-4">
            <Sparkles size={28} className="text-accent-text" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">No Brand DNA yet</h2>
          {editable ? (
            <>
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
            </>
          ) : (
            <p className="text-sm text-text-muted max-w-md">
              Your Nativz team will distill this from the brand&apos;s website
              and publish it here once it&apos;s ready.
            </p>
          )}
        </div>
      )}

      {/* Generate wizard + section editor — admin-only. */}
      {editable && (
        <>
          <OnboardWizard
            open={generateOpen}
            onClose={() => { setGenerateOpen(false); router.refresh(); }}
            existingClientId={clientId}
            existingClientName={clientName}
          />
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
        </>
      )}
    </div>
  );
}
