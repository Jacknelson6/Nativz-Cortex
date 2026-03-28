'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Dna, Layers, LayoutGrid } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { Pillar } from '@/components/ideas-hub/pillar-card';
import {
  TopicSearchSelectionCard,
  type TopicSearchRow,
} from '@/components/strategy-lab/topic-search-selection-card';

const STORAGE_PREFIX = 'strategy-lab:selected-topic-searches:';

type MoodboardRow = {
  id: string;
  name: string;
};

export function StrategyLabWorkspace({
  clientId,
  clientSlug,
  brandDnaStatus,
  topicSearches,
  pillars,
  moodBoards,
}: {
  clientId: string;
  clientSlug: string;
  brandDnaStatus: string;
  topicSearches: TopicSearchRow[];
  pillars: Pillar[];
  moodBoards: MoodboardRow[];
}) {
  const storageKey = `${STORAGE_PREFIX}${clientId}`;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const ids = parsed.filter((x): x is string => typeof x === 'string');
      setSelectedIds(new Set(ids));
    } catch {
      // ignore corrupt storage
    }
  }, [storageKey]);

  const persistSelection = useCallback(
    (next: Set<string>) => {
      setSelectedIds(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // ignore quota
      }
    },
    [storageKey],
  );

  const toggleId = useCallback(
    (id: string) => {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistSelection(next);
    },
    [selectedIds, persistSelection],
  );

  const dnaCopy = useMemo(() => {
    switch (brandDnaStatus) {
      case 'active':
        return 'Brand DNA is active. Open the full profile to review or refresh.';
      case 'draft':
        return 'Brand DNA is in draft. Review and publish from the client page.';
      case 'generating':
        return 'Brand DNA is generating. Check back shortly.';
      default:
        return 'No brand DNA yet. Generate it from the client’s brand DNA page.';
    }
  }, [brandDnaStatus]);

  return (
    <div className="flex flex-col gap-6">
      <TopicSearchSelectionCard
        topicSearches={topicSearches}
        selectedIds={selectedIds}
        onToggle={toggleId}
      />

      <Card className="border-nativz-border/60 bg-surface p-5">
        <div className="mb-3 flex items-center gap-2">
          <Dna className="h-5 w-5 text-accent-text" aria-hidden />
          <h2 className="text-lg font-semibold text-foreground">Brand DNA</h2>
        </div>
        <p className="text-sm text-text-muted">{dnaCopy}</p>
        <Link
          href={`/admin/clients/${clientSlug}/brand-dna`}
          className="mt-3 inline-flex text-sm font-medium text-accent-text underline-offset-4 hover:underline"
        >
          View brand DNA
        </Link>
      </Card>

      <Card className="border-nativz-border/60 bg-surface p-5">
        <div className="mb-3 flex items-center gap-2">
          <Layers className="h-5 w-5 text-accent-text" aria-hidden />
          <h2 className="text-lg font-semibold text-foreground">Content pillars</h2>
        </div>
        {pillars.length === 0 ? (
          <p className="text-sm text-text-muted">
            No pillars yet. They will appear here after they are created for this client (ideas flow or
            future generation).
          </p>
        ) : (
          <ul className="space-y-3">
            {pillars.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-nativz-border/40 bg-background/50 px-3 py-3"
              >
                <div className="flex items-start gap-2">
                  {p.emoji ? (
                    <span className="text-lg leading-none" aria-hidden>
                      {p.emoji}
                    </span>
                  ) : null}
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{p.name}</p>
                    {p.description ? (
                      <p className="mt-1 text-sm text-text-muted">{p.description}</p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="border-nativz-border/60 bg-surface p-5">
        <div className="mb-3 flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-accent-text" aria-hidden />
          <h2 className="text-lg font-semibold text-foreground">Mood boards</h2>
        </div>
        {moodBoards.length === 0 ? (
          <p className="text-sm text-text-muted">
            No mood boards linked to this client. Create one from{' '}
            <Link href="/admin/analysis" className="text-accent-text underline-offset-4 hover:underline">
              Analysis
            </Link>{' '}
            and attach the client.
          </p>
        ) : (
          <ul className="space-y-2">
            {moodBoards.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/admin/analysis/${b.id}`}
                  className="block rounded-lg border border-nativz-border/40 bg-background/50 px-3 py-2.5 text-sm font-medium text-foreground transition hover:border-nativz-border"
                >
                  {b.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
