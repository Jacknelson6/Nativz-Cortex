'use client';

import { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface DecayBucket {
  label: string;
  order: number;
  avgPctOfFinal: number;
  postCount: number;
}

export function ContentDecayCard({ clientId }: { clientId: string }) {
  const [buckets, setBuckets] = useState<DecayBucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ clientId });
    fetch(`/api/reporting/content-decay?${qs}`)
      .then((r) => (r.ok ? r.json() : { buckets: [] }))
      .then((d) => setBuckets(d.buckets ?? []))
      .catch(() => setBuckets([]))
      .finally(() => setLoading(false));
  }, [clientId]);

  if (!loading && buckets.length === 0) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-text-primary">Content performance decay</h3>
        <p className="text-xs text-text-muted mt-2">
          Zernio hasn't returned decay data for this workspace yet.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-text-primary">Content performance decay</h3>
        <p className="text-xs text-text-muted mt-0.5">
          % of final engagement reached by each time bucket — earlier bars = faster decay
        </p>
      </div>
      {loading ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.55)' }}
                stroke="rgba(255,255,255,0.08)"
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.55)' }}
                stroke="rgba(255,255,255,0.08)"
                domain={[0, 100]}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15,17,22,0.97)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(v, _n, item) => [
                  `${Number(v).toFixed(1)}% (${item.payload.postCount} posts)`,
                  'Avg % of final',
                ]}
              />
              <Bar dataKey="avgPctOfFinal" fill="#60a5fa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
