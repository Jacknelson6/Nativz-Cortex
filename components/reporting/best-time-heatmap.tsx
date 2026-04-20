'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Slot {
  dayOfWeek: number;
  hour: number;
  avgEngagement: number;
  postCount: number;
}

interface BestTimeHeatmapProps {
  clientId: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatHour(h: number): string {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h > 12 ? `${h - 12}p` : `${h}a`;
}

export function BestTimeHeatmap({ clientId }: BestTimeHeatmapProps) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/reporting/best-time?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((d) => setSlots(d.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [clientId]);

  const { map, maxEng, topSlots } = useMemo(() => {
    const m = new Map<string, Slot>();
    let max = 0;
    for (const s of slots) {
      const key = `${s.dayOfWeek}-${s.hour}`;
      m.set(key, s);
      if (s.avgEngagement > max) max = s.avgEngagement;
    }
    const top = [...slots].sort((a, b) => b.avgEngagement - a.avgEngagement).slice(0, 3);
    return { map: m, maxEng: max, topSlots: top };
  }, [slots]);

  if (loading) return <Skeleton className="h-64" />;

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Best time to post</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Average engagement by day × hour, from Zernio's posting history.
          </p>
        </div>
        {topSlots.length > 0 && (
          <div className="flex gap-1.5 text-[10px]">
            {topSlots.map((s, i) => (
              <span
                key={i}
                className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300 border border-emerald-500/25"
              >
                {DAYS[s.dayOfWeek]} {formatHour(s.hour)}
              </span>
            ))}
          </div>
        )}
      </div>

      {slots.length === 0 ? (
        <p className="text-xs text-text-muted py-6 text-center">
          Not enough posting history yet.
        </p>
      ) : (
        <div className="flex gap-2">
          <div className="flex flex-col justify-between text-[9px] text-text-muted pt-4 pb-1">
            {DAYS.map((d) => (
              <span key={d} className="h-3 leading-3">{d}</span>
            ))}
          </div>
          <div className="flex-1">
            <div className="grid grid-cols-24 gap-0.5" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={`label-${h}`}
                  className="h-3 text-center text-[8px] text-text-muted leading-3"
                >
                  {h % 3 === 0 ? formatHour(h) : ''}
                </div>
              ))}
              {DAYS.map((_day, d) =>
                Array.from({ length: 24 }, (_, h) => {
                  const slot = map.get(`${d}-${h}`);
                  const intensity = slot && maxEng > 0 ? slot.avgEngagement / maxEng : 0;
                  let cls = 'bg-white/5';
                  if (intensity > 0.75) cls = 'bg-emerald-400';
                  else if (intensity > 0.5) cls = 'bg-emerald-500/75';
                  else if (intensity > 0.25) cls = 'bg-emerald-500/50';
                  else if (intensity > 0) cls = 'bg-emerald-500/25';
                  return (
                    <div
                      key={`${d}-${h}`}
                      title={slot ? `${DAYS[d]} ${formatHour(h)} · ${slot.avgEngagement.toFixed(1)} avg engagement (${slot.postCount} posts)` : ''}
                      className={`h-3 rounded-sm ${cls}`}
                    />
                  );
                }),
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
