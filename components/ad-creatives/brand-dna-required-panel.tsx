'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dna,
  Loader2,
  RefreshCw,
  Upload,
  Sparkles,
  Globe,
  FileStack,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { OnboardWizard } from '@/components/brand-dna/onboard-wizard';

interface BrandDnaRequiredPanelProps {
  clientId: string;
  clientName: string;
  brandDnaStatus: string | null | undefined;
  /** Client profile website — pre-fills the generate wizard when set. */
  websiteUrl?: string | null;
}

/**
 * Shown before the ad wizard when the selected client does not yet have usable Brand DNA.
 */
export function BrandDnaRequiredPanel({
  clientId,
  clientName,
  brandDnaStatus,
  websiteUrl,
}: BrandDnaRequiredPanelProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isGenerating = brandDnaStatus === 'generating';

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (let i = 0; i < files.length; i++) fd.append('files', files[i]);
      const res = await fetch(`/api/clients/${clientId}/brand-dna/upload`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      toast.success(
        data.entryIds?.length
          ? `${data.entryIds.length} file(s) saved. Run Brand DNA generation to pull tone and colors from them.`
          : 'Files uploaded.',
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div
        className="relative overflow-hidden rounded-2xl border border-nativz-border bg-surface shadow-[0_24px_48px_-12px_rgba(0,0,0,0.45)]"
        role="region"
        aria-labelledby="brand-dna-gate-title"
        aria-busy={isGenerating}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-border/50 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[min(100%,28rem)] -translate-x-1/2 rounded-full bg-accent-text/[0.07] blur-3xl"
          aria-hidden
        />

        <div className="relative px-6 py-8 sm:px-10 sm:py-10 space-y-8">
          <div className="flex flex-col items-center text-center sm:items-start sm:text-left gap-5 sm:flex-row sm:gap-6">
            <div
              className={`relative flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-2xl border border-accent-border/25 bg-gradient-to-br from-accent-surface/35 to-accent-surface/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_12px_40px_-16px_rgba(59,130,246,0.45)] ${isGenerating ? 'animate-pulse' : ''}`}
            >
              {isGenerating ? (
                <Loader2 className="h-8 w-8 text-accent-text animate-spin" strokeWidth={1.75} />
              ) : (
                <Dna className="h-8 w-8 text-accent-text" strokeWidth={1.75} />
              )}
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-text/90">
                {isGenerating ? 'In progress' : 'One quick setup'}
              </p>
              <h2
                id="brand-dna-gate-title"
                className="text-xl font-semibold tracking-tight text-text-primary sm:text-[1.35rem]"
              >
                {isGenerating ? (
                  <>Generating Brand DNA for {clientName}</>
                ) : (
                  <>
                    Generate Brand DNA for{' '}
                    <span className="text-text-primary">{clientName}</span>
                  </>
                )}
              </h2>
              <p className="text-sm text-text-muted leading-relaxed max-w-md mx-auto sm:mx-0">
                {isGenerating ? (
                  <>
                    You can leave this page open. When the run finishes, tap{' '}
                    <span className="text-text-secondary">Refresh</span> below to load the ad wizard.
                  </>
                ) : (
                  <>
                    Run generation once so we have colors, logos, tone, and product context before creating ads.
                    You only need to do this per client unless you refresh their profile later.
                  </>
                )}
              </p>
            </div>
          </div>

          {!isGenerating && (
            <ul className="space-y-2.5" aria-label="Steps to enable ad generation">
              <li>
                <div className="group flex gap-3.5 rounded-xl border border-nativz-border/90 bg-background/35 p-4 transition-colors hover:border-nativz-border hover:bg-background/50">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-surface/30 text-accent-text ring-1 ring-accent-border/20">
                    <Globe size={18} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-medium text-text-primary">Generate Brand DNA from the web</p>
                    <p className="mt-0.5 text-xs text-text-muted leading-relaxed">
                      Use the button below to open the wizard here, confirm their site URL, and start (or re-run) analysis.
                    </p>
                  </div>
                </div>
              </li>
              <li>
                <div className="group flex gap-3.5 rounded-xl border border-nativz-border/90 bg-background/35 p-4 transition-colors hover:border-nativz-border hover:bg-background/50">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-text-secondary ring-1 ring-nativz-border-light">
                    <FileStack size={18} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-medium text-text-primary">Optional files</p>
                    <p className="mt-0.5 text-xs text-text-muted leading-relaxed">
                      Upload guidelines, PDFs, or logos — they feed the same Brand DNA pipeline.
                    </p>
                  </div>
                </div>
              </li>
              <li>
                <div className="group flex gap-3.5 rounded-xl border border-nativz-border/90 bg-background/35 p-4 transition-colors hover:border-nativz-border hover:bg-background/50">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-text-secondary ring-1 ring-nativz-border-light">
                    <RefreshCw size={18} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-medium text-text-primary">Return to ad creatives</p>
                    <p className="mt-0.5 text-xs text-text-muted leading-relaxed">
                      When status is draft or active, tap Refresh to load the ad wizard.
                    </p>
                  </div>
                </div>
              </li>
            </ul>
          )}

          <div className="flex flex-col gap-3 pt-1">
            <Button
              type="button"
              size="lg"
              className="w-full h-11 font-medium shadow-sm shadow-black/20"
              disabled={isGenerating}
              onClick={() => {
                if (isGenerating) return;
                setGenerateOpen(true);
              }}
            >
              <Sparkles size={17} strokeWidth={2} />
              Generate Brand DNA
            </Button>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-10 border-nativz-border-light bg-background/30 hover:bg-background/50"
                disabled={uploading || isGenerating}
                onClick={() => {
                  if (isGenerating) return;
                  fileRef.current?.click();
                }}
              >
                {uploading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}
                Upload assets
              </Button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,.pdf,.md,.txt,.docx"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-10 border-nativz-border-light bg-background/30 hover:bg-background/50"
                onClick={() => router.refresh()}
              >
                <RefreshCw size={16} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <OnboardWizard
        open={generateOpen}
        onClose={() => {
          setGenerateOpen(false);
          router.refresh();
        }}
        existingClientId={clientId}
        existingClientName={clientName}
        initialWebsiteUrl={websiteUrl}
      />
    </div>
  );
}
