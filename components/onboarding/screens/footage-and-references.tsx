'use client';

/**
 * Footage and references screen (editing onboarding only).
 *
 * Two URL buckets (raw footage, reference edits) plus free-text notes.
 * Light client-side parsing strips empty lines and trims; the
 * post-production team eyeballs the actual links. Nothing here blocks
 * the kickoff call.
 */

import { useState } from 'react';
import { Loader2, Film, Sparkles, NotebookPen } from 'lucide-react';
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

interface LinkBoxProps {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  rows: number;
  disabled: boolean;
}

function LinkBox({
  id,
  title,
  description,
  icon,
  value,
  onChange,
  placeholder,
  rows,
  disabled,
}: LinkBoxProps) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface-hover/40 px-4 py-4 transition-colors focus-within:border-accent">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent-text">
          {icon}
        </div>
        <div className="min-w-0">
          <label
            htmlFor={id}
            className="block text-sm font-medium text-text-primary"
          >
            {title}
          </label>
          <p className="text-xs text-text-muted">{description}</p>
        </div>
      </div>
      <Textarea
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        disabled={disabled}
      />
    </div>
  );
}

export function FootageAndReferencesScreen({ value, clientName, submitting, onSubmit }: Props) {
  const initial = (value as FootageAndReferencesState | null) ?? {};
  const [rawFootage, setRawFootage] = useState(urlsToText(initial.raw_footage_urls));
  const [referenceEdits, setReferenceEdits] = useState(urlsToText(initial.reference_edit_urls));
  const [notes, setNotes] = useState(initial.notes ?? '');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (submitting) return;
        onSubmit({
          raw_footage_urls: parseUrls(rawFootage),
          reference_edit_urls: parseUrls(referenceEdits),
          // Preserve any previous_edit_urls already saved server-side; we
          // just stopped collecting them in the UI.
          previous_edit_urls: initial.previous_edit_urls ?? [],
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
          Drop in anything for {clientName}: raw clips and edits you love. One link per line.
          Drive, Frame.io, Dropbox, YouTube, all fine.
        </p>
      </div>

      <div className="space-y-4">
        <LinkBox
          id="raw-footage"
          title="Raw footage"
          description="Source clips we'll cut from."
          icon={<Film size={16} />}
          value={rawFootage}
          onChange={setRawFootage}
          placeholder={'https://drive.google.com/...\nhttps://frame.io/...'}
          rows={4}
          disabled={submitting}
        />

        <LinkBox
          id="reference-edits"
          title="Reference edits / inspiration"
          description="Edits whose style or pacing we should match."
          icon={<Sparkles size={16} />}
          value={referenceEdits}
          onChange={setReferenceEdits}
          placeholder={'https://www.youtube.com/...\nhttps://www.tiktok.com/@...'}
          rows={4}
          disabled={submitting}
        />

        <div className="rounded-xl border border-nativz-border bg-surface-hover/40 px-4 py-4 transition-colors focus-within:border-accent">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent-text">
              <NotebookPen size={16} />
            </div>
            <div className="min-w-0">
              <label
                htmlFor="footage-notes"
                className="block text-sm font-medium text-text-primary"
              >
                Notes (optional)
              </label>
              <p className="text-xs text-text-muted">
                Anything we should know before opening the project.
              </p>
            </div>
          </div>
          <Textarea
            id="footage-notes"
            placeholder="Music, pacing, must-have shots, do-not-use clips, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            maxLength={4000}
            disabled={submitting}
          />
        </div>
      </div>

      <div className="flex justify-end">
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
