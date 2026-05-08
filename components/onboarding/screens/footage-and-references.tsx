'use client';

/**
 * Footage and references screen (editing onboarding only).
 *
 * Three optional URL buckets, one per line, plus free-text notes. Light
 * client-side parsing strips empty lines and trims; the post-production
 * team eyeballs the actual links. Nothing here blocks the kickoff call.
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import type { FootageAndReferencesState } from '@/lib/onboarding/types';

interface Props {
  value: Record<string, unknown> | null;
  clientName: string;
  submitting: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
}

function urlsToText(urls: string[] | undefined): string {
  return (urls ?? []).join('\n');
}

function parseUrls(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function FootageAndReferencesScreen({ value, clientName, submitting, onSubmit }: Props) {
  const initial = (value as FootageAndReferencesState | null) ?? {};
  const [rawFootage, setRawFootage] = useState(urlsToText(initial.raw_footage_urls));
  const [referenceEdits, setReferenceEdits] = useState(urlsToText(initial.reference_edit_urls));
  const [previousEdits, setPreviousEdits] = useState(urlsToText(initial.previous_edit_urls));
  const [notes, setNotes] = useState(initial.notes ?? '');

  const hasAnything =
    rawFootage.trim().length > 0 ||
    referenceEdits.trim().length > 0 ||
    previousEdits.trim().length > 0 ||
    notes.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (submitting) return;
        onSubmit({
          raw_footage_urls: parseUrls(rawFootage),
          reference_edit_urls: parseUrls(referenceEdits),
          previous_edit_urls: parseUrls(previousEdits),
          notes: notes.trim(),
        });
      }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h1 className="text-[28px] leading-tight font-semibold text-text-primary sm:text-3xl">
          Footage and references
        </h1>
        <p className="text-base text-text-secondary">
          Drop in anything for {clientName}: raw clips, edits you love, previous work. One link
          per line. Drive, Frame.io, Dropbox, YouTube, all fine.
        </p>
      </div>

      <div className="space-y-4">
        <Textarea
          id="raw-footage"
          label="Raw footage (optional)"
          placeholder={'https://drive.google.com/...\nhttps://frame.io/...'}
          value={rawFootage}
          onChange={(e) => setRawFootage(e.target.value)}
          rows={4}
          disabled={submitting}
        />

        <Textarea
          id="reference-edits"
          label="Reference edits / inspiration (optional)"
          placeholder={'https://www.youtube.com/...\nhttps://www.tiktok.com/@...'}
          value={referenceEdits}
          onChange={(e) => setReferenceEdits(e.target.value)}
          rows={4}
          disabled={submitting}
        />

        <Textarea
          id="previous-edits"
          label="Previous edits we should match (optional)"
          placeholder={'https://www.youtube.com/...'}
          value={previousEdits}
          onChange={(e) => setPreviousEdits(e.target.value)}
          rows={3}
          disabled={submitting}
        />

        <Textarea
          id="footage-notes"
          label="Notes (optional)"
          placeholder="Anything we should know before we open the project. Music, pacing, must-have shots, do-not-use clips, etc."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          maxLength={4000}
          disabled={submitting}
        />
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-text-muted">
          {hasAnything
            ? 'You can keep adding links later from this same page.'
            : 'Skip if you’d rather hand this off on the kickoff call.'}
        </p>
        <Button type="submit" size="lg" disabled={submitting} className="w-full sm:w-auto">
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
