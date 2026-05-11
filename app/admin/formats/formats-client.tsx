'use client';

// VFF-07 T13/T14 (client island): subscribes to the admin brand pill via
// useActiveBrand() and refetches /api/admin/formats/feed when the brand
// changes. Initial payload comes from the server entry.

import { useEffect, useState } from 'react';
import { useActiveBrand } from '@/lib/admin/active-client-context';
import type { FormatFeedPayload } from '@/lib/analytics/format-feed';
import { FormatGrid } from '@/components/formats/format-grid';
import { FormatRowSkeleton } from '@/components/formats/format-row-skeleton';

type Props = {
  initialPayload: FormatFeedPayload;
  initialClientId: string | null;
};

export function FormatsClient({ initialPayload, initialClientId }: Props) {
  const { brand } = useActiveBrand();
  const [payload, setPayload] = useState<FormatFeedPayload>(initialPayload);
  const [loading, setLoading] = useState(false);
  const [activeClientId, setActiveClientId] = useState<string | null>(initialClientId);

  useEffect(() => {
    const nextId = brand?.id ?? null;
    if (nextId === activeClientId) return;
    setActiveClientId(nextId);

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const qs = nextId ? `?client_id=${encodeURIComponent(nextId)}` : '';
        const res = await fetch(`/api/admin/formats/feed${qs}`);
        if (!res.ok) return;
        const json = (await res.json()) as FormatFeedPayload;
        if (!cancelled) setPayload(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [brand?.id, activeClientId]);

  if (loading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
            <FormatRowSkeleton />
          </div>
        ))}
      </div>
    );
  }

  return <FormatGrid payload={payload} />;
}
