'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
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
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function formatHour(h: number): string {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h > 12 ? `${h - 12}p` : `${h}a`;
}

export function BestTimeHeatmap({ clientId }: BestTimeHeatmapProps) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadSlots() {
      setLoading(true);
      try {
        const r = await fetch(`/api/reporting/best-time?clientId=${clientId}`);
        const d = r.ok ? await r.json() : { slots: [] };
        if (!cancelled) setSlots(d.slots ?? []);
      } catch {
        if (!cancelled) setSlots([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadSlots();
    return () => {
      cancelled = true;
    };
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

  if (loading) return <Skeleton className="h-72" />;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="ui-card-title">Best time to post</h3>
          <p className="text-sm text-text-muted mt-0.5">
            Average engagement by day × hour, from posting history.
          </p>
        </div>
        {topSlots.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {topSlots.map((s, i) => (
              <span
                key={i}
                className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 border border-emerald-500/25 tabular-nums"
              >
                {DAYS[s.dayOfWeek]} {formatHour(s.hour)}
              </span>
            ))}
          </div>
        )}
      </div>

      {slots.length === 0 ? (
        <p className="text-sm text-text-muted py-10 text-center">
          Not enough posting history yet.
        </p>
      ) : (
        <div className="space-y-1">
          {/* Grid with a 40px day-label column + 24 hour columns. Using CSS
              grid on the whole block so the hour-label row aligns to every cell. */}
          <div
            className="grid items-center gap-1 text-xs text-text-muted"
            style={{ gridTemplateColumns: '40px repeat(24, minmax(0, 1fr))' }}
          >
            {/* Hour labels — every hour labeled (24h row) */}
            <span aria-hidden />
            {HOURS.map((h) => (
              <span
                key={`hdr-${h}`}
                className="text-center text-[10px] tabular-nums text-text-muted"
              >
                {formatHour(h)}
              </span>
            ))}

            {DAYS.map((day, d) => (
              <Fragment key={`row-${d}`}>
                <span className="pr-1 text-right text-xs font-medium text-text-secondary">
                  {day}
                </span>
                {HOURS.map((h) => {
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
                      title={
                        slot
                          ? `${DAYS[d]} ${formatHour(h)} · ${slot.avgEngagement.toFixed(1)} avg engagement (${slot.postCount} posts)`
                          : `${DAYS[d]} ${formatHour(h)} · no data`
                      }
                      className={`h-5 rounded-sm ${cls}`}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-end gap-2 pt-3 text-xs text-text-muted">
            <span>Low</span>
            <div className="flex items-center gap-0.5">
              <span className="h-3 w-3 rounded-sm bg-emerald-500/25" />
              <span className="h-3 w-3 rounded-sm bg-emerald-500/50" />
              <span className="h-3 w-3 rounded-sm bg-emerald-500/75" />
              <span className="h-3 w-3 rounded-sm bg-emerald-400" />
            </div>
            <span>High</span>
          </div>
        </div>
      )}
    </Card>
  );
}
