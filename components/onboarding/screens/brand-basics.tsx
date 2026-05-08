'use client';

/**
 * Brand basics screen.
 *
 * Captures the brand fundamentals we need to start producing content:
 * tagline, what they sell, audience, voice, current offers. Fields are
 * pre-filled from the live `clients` row when the strategist already
 * captured anything during setup, so the client never sees an empty
 * form when we already know the answers.
 *
 * On submit the API mirrors all five fields back onto the `clients`
 * row, so admin views and step_state stay in lockstep.
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
  current_offers?: string;
}

export interface BrandBasicsPrefill {
  tagline: string | null;
  what_we_sell: string | null;
  audience: string | null;
  voice: string | null;
  current_offers: string | null;
}

interface Props {
  value: Record<string, unknown> | null;
  clientName: string;
  /**
   * Latest fields from the `clients` row. Used as the initial form value
   * when step_state has nothing yet, so the client only fills in gaps.
   */
  prefill: BrandBasicsPrefill | null;
  submitting: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
}

function pick(stepValue: unknown, prefillValue: unknown): string {
  if (typeof stepValue === 'string' && stepValue.trim().length > 0) return stepValue;
  if (typeof prefillValue === 'string') return prefillValue;
  return '';
}

export function BrandBasicsScreen({ value, clientName, prefill, submitting, onSubmit }: Props) {
  const initial = (value as BrandBasicsValue | null) ?? {};
  const [tagline, setTagline] = useState(pick(initial.tagline, prefill?.tagline));
  const [whatWeSell, setWhatWeSell] = useState(pick(initial.what_we_sell, prefill?.what_we_sell));
  const [audience, setAudience] = useState(pick(initial.audience, prefill?.audience));
  const [voice, setVoice] = useState(pick(initial.voice, prefill?.voice));
  const [currentOffers, setCurrentOffers] = useState(
    pick(initial.current_offers, prefill?.current_offers),
  );

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
          current_offers: currentOffers.trim(),
        });
      }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h1 className="text-[28px] leading-tight font-semibold text-text-primary sm:text-3xl">
          Brand basics
        </h1>
        <p className="text-base text-text-secondary">
          A few sentences on {clientName} so the team can hit the ground running.
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

        <Textarea
          id="current_offers"
          label="Current offers or promotions (optional)"
          placeholder="Anything we should be highlighting right now? Sales, launches, new products, lead magnets."
          value={currentOffers}
          onChange={(e) => setCurrentOffers(e.target.value)}
          rows={3}
          maxLength={500}
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
