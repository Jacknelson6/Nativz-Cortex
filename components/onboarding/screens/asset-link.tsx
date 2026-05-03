'use client';

/**
 * Asset link screen (editing kind).
 *
 * The client drops a single share URL pointing at a folder of raw
 * footage in their cloud storage of choice (Drive, Dropbox, Frame.io,
 * iCloud, WeTransfer). We capture provider as a hint so the editor
 * knows what permission flow to expect, but the URL is the truth.
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';

interface AssetLinkValue {
  url?: string;
  provider?: string;
  notes?: string;
}

interface Props {
  value: Record<string, unknown> | null;
  submitting: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
}

const PROVIDERS = [
  'Google Drive',
  'Dropbox',
  'Frame.io',
  'iCloud',
  'WeTransfer',
  'Other',
];

function looksLikeUrl(s: string): boolean {
  try {
    new URL(s.trim());
    return true;
  } catch {
    return false;
  }
}

export function AssetLinkScreen({ value, submitting, onSubmit }: Props) {
  const initial = (value as AssetLinkValue | null) ?? {};
  const [url, setUrl] = useState(initial.url ?? '');
  const [provider, setProvider] = useState(initial.provider ?? PROVIDERS[0]);
  const [notes, setNotes] = useState(initial.notes ?? '');

  const urlValid = looksLikeUrl(url);
  const canSubmit = urlValid && !submitting;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          url: url.trim(),
          provider,
          notes: notes.trim(),
        });
      }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-text-primary">Drop your assets</h1>
        <p className="text-base text-text-secondary">
          Paste a share link to the folder with your raw footage. Make sure anyone with the link can view.
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-secondary">Where&apos;s it stored?</label>
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProvider(p)}
              disabled={submitting}
              className={
                provider === p
                  ? 'rounded-full border border-accent bg-accent/15 px-3 py-1.5 text-sm text-accent-text'
                  : 'rounded-full border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-secondary hover:border-accent hover:text-text-primary'
              }
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <Input
        id="asset_url"
        type="url"
        label="Share URL"
        placeholder="https://drive.google.com/drive/folders/..."
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={submitting}
        error={url.length > 0 && !urlValid ? 'That doesn\'t look like a valid URL.' : undefined}
      />

      <Textarea
        id="asset_notes"
        label="Anything we should know? (optional)"
        placeholder="Folder structure, file naming, footage we should prioritize, etc."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        maxLength={500}
        disabled={submitting}
      />

      <div className="flex items-center justify-end">
        <Button type="submit" size="lg" disabled={!canSubmit}>
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Saving...
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </div>
    </form>
  );
}
