'use client';

import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useActiveBrand } from '@/lib/admin/active-client-context';
import type { ContentDrop } from '@/lib/types/calendar';

export default function CalendarPage() {
  const { brand } = useActiveBrand();
  const [drops, setDrops] = useState<ContentDrop[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!brand?.id) {
      setDrops([]);
      return;
    }
    setLoading(true);
    fetch(`/api/calendar/drops?clientId=${brand.id}`)
      .then((r) => r.json())
      .then((data) => setDrops(data.drops ?? []))
      .finally(() => setLoading(false));
  }, [brand?.id]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-text-primary">Content calendar</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Drop a Drive folder, get scheduled posts and a client share link.
          </p>
        </div>
      </header>

      {!brand && (
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">Pick a brand from the top bar to get started.</p>
        </div>
      )}

      {brand && loading && (
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center text-sm text-text-secondary">
          Loading drops…
        </div>
      )}

      {brand && !loading && drops.length === 0 && (
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">No drops yet for {brand.name}.</p>
        </div>
      )}
    </div>
  );
}
