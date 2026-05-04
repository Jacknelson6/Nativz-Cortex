'use client';

/**
 * Brand basics screen.
 *
 * Captures the bare-minimum info we need to start producing content for
 * the client: tagline, what they sell, audience snapshot, voice. We
 * intentionally don't ask for logo or colors here, those live in the
 * brand profile and are admin-managed; this is just so the strategist
 * has a starting point on day one.
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';

interface BrandBasicsValue {
  tagline?: string;
  what_we_sell?: string;
  audience?: string;
  voice?: string;
}

interface Props {
  value: Record<string, unknown> | null;
  clientName: string;
  submitting: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
}

export function BrandBasicsScreen({ value, clientName, submitting, onSubmit }: Props) {
  const initial = (value as BrandBasicsValue | null) ?? {};
  const [tagline, setTagline] = useState(initial.tagline ?? '');
  const [whatWeSell, setWhatWeSell] = useState(initial.what_we_sell ?? '');
  const [audience, setAudience] = useState(initial.audience ?? '');
  const [voice, setVoice] = useState(initial.voice ?? '');

  const canSubmit = whatWeSell.trim().length > 0 && audience.trim().length > 0 && !submitting;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          tagline: tagline.trim(),
          what_we_sell: whatWeSell.trim(),
          audience: audience.trim(),
          voice: voice.trim(),
        });
      }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h1 className="text-[28px] leading-tight font-semibold text-text-primary sm:text-3xl">
          Brand basics
        </h1>
        <p className="text-base text-text-secondary">
          The fast facts about {clientName}. Two minutes, four boxes.
        </p>
      </div>

      <div className="space-y-4">
        <Input
          id="tagline"
          label="One-line tagline (optional)"
          placeholder="e.g. Performance gear for everyday athletes."
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          maxLength={140}
          disabled={submitting}
        />

        <Textarea
          id="what_we_sell"
          label="What you sell, in plain English"
          placeholder="What does the company actually offer? Who pays you?"
          value={whatWeSell}
          onChange={(e) => setWhatWeSell(e.target.value)}
          rows={3}
          maxLength={500}
          disabled={submitting}
        />

        <Textarea
          id="audience"
          label="Who is the audience?"
          placeholder="Age range, vibe, what they care about, what they hate."
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          rows={3}
          maxLength={500}
          disabled={submitting}
        />

        <Textarea
          id="voice"
          label="How should the brand sound? (optional)"
          placeholder="Three words, or a sentence. e.g. confident, dry, anti-corporate."
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          rows={2}
          maxLength={300}
          disabled={submitting}
        />
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="submit"
          size="lg"
          disabled={!canSubmit}
          className="w-full sm:w-auto"
        >
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
