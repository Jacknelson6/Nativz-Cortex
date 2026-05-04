'use client';

/**
 * Project brief screen (editing kind).
 *
 * One paragraph of "what we're editing", a deliverable count target,
 * and optional reference URLs. The reference list is whitespace-split
 * client-side and stored as an array; we don't validate URL shape
 * because half the time it's a Drive folder, sometimes it's a competitor
 * post the editor should match the vibe of.
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';

interface ProjectBriefValue {
  description?: string;
  target_count?: number;
  references?: string[];
}

interface Props {
  value: Record<string, unknown> | null;
  submitting: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
}

export function ProjectBriefScreen({ value, submitting, onSubmit }: Props) {
  const initial = (value as ProjectBriefValue | null) ?? {};
  const [description, setDescription] = useState(initial.description ?? '');
  const [targetCount, setTargetCount] = useState<string>(
    initial.target_count != null ? String(initial.target_count) : '',
  );
  const [refsText, setRefsText] = useState((initial.references ?? []).join('\n'));

  const canSubmit = description.trim().length > 0 && !submitting;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        const parsedCount = Number.parseInt(targetCount, 10);
        const refs = refsText
          .split(/[\n,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        onSubmit({
          description: description.trim(),
          target_count: Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : null,
          references: refs,
        });
      }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h1 className="text-[28px] leading-tight font-semibold text-text-primary sm:text-3xl">
          Project brief
        </h1>
        <p className="text-base text-text-secondary">
          What are we editing, how many cuts, and what should it feel like?
        </p>
      </div>

      <Textarea
        id="description"
        label="What's the project?"
        placeholder="Recap reel from a 2-day shoot, broken into vertical clips for IG and TikTok."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={5}
        maxLength={1000}
        disabled={submitting}
      />

      <Input
        id="target_count"
        type="number"
        min={1}
        label="How many deliverables? (optional)"
        placeholder="e.g. 8"
        value={targetCount}
        onChange={(e) => setTargetCount(e.target.value)}
        disabled={submitting}
      />

      <Textarea
        id="references"
        label="Reference links (optional)"
        placeholder={'Paste any reference URLs, one per line.\nhttps://tiktok.com/...\nhttps://instagram.com/...'}
        value={refsText}
        onChange={(e) => setRefsText(e.target.value)}
        rows={4}
        disabled={submitting}
      />

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
