'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Dna, Loader2, RefreshCw, Upload, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface BrandDnaRequiredPanelProps {
  clientId: string;
  clientSlug: string;
  clientName: string;
  brandDnaStatus: string | null | undefined;
}

/**
 * Shown before the ad wizard when the selected client does not yet have usable Brand DNA.
 */
export function BrandDnaRequiredPanel({
  clientId,
  clientSlug,
  clientName,
  brandDnaStatus,
}: BrandDnaRequiredPanelProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
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
    <div className="max-w-xl mx-auto rounded-2xl border border-nativz-border bg-surface p-8 space-y-6">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
          {isGenerating ? (
            <Loader2 className="h-6 w-6 text-accent-text animate-spin" />
          ) : (
            <Dna className="h-6 w-6 text-accent-text" />
          )}
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-text-primary">Checking Brand DNA</h2>
          <p className="text-sm text-text-muted leading-relaxed">
            {isGenerating ? (
              <>
                Brand DNA is still generating for <span className="text-text-secondary">{clientName}</span>.
                You can keep this page open and refresh in a minute.
              </>
            ) : (
              <>
                Before we create ads, we need a Brand DNA profile for{' '}
                <span className="text-text-secondary">{clientName}</span> — colors, logos, tone of voice, and
                product context. You only need to build it once (unless you refresh it later).
              </>
            )}
          </p>
        </div>
      </div>

      {!isGenerating && (
        <div className="space-y-3 rounded-xl border border-nativz-border bg-background/40 p-4">
          <p className="text-xs text-text-muted uppercase tracking-wide">Next steps</p>
          <ol className="text-sm text-text-secondary space-y-2 list-decimal list-inside">
            <li>Open Brand DNA and run generation from their website (or refresh if already started).</li>
            <li>Optional: upload brand guidelines, PDFs, or logo files — they feed into the same pipeline.</li>
            <li>Come back here and click &quot;Check again&quot; once status is draft or active.</li>
          </ol>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="button"
          className="flex-1"
          onClick={() => router.push(`/admin/clients/${clientSlug}/brand-dna`)}
        >
          <ExternalLink size={16} />
          Open Brand DNA
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
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
        <Button type="button" variant="secondary" onClick={() => router.refresh()}>
          <RefreshCw size={16} />
          Check again
        </Button>
      </div>
    </div>
  );
}
