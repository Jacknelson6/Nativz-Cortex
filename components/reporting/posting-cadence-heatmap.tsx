'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface CadenceRow {
  day: string;
  count: number;
  byPlatform: Record<string, number>;
}

interface PostingCadenceHeatmapProps {
  clientId: string;
  start: string;
  end: string;
}

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const dow = (copy.getUTCDay() + 6) % 7; // Mon=0
  copy.setUTCDate(copy.getUTCDate() - dow);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export function PostingCadenceHeatmap({ clientId, start, end }: PostingCadenceHeatmapProps) {
  const [rows, setRows] = useState<CadenceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ clientId, start, end });
    fetch(`/api/reporting/cadence?${qs}`)
      .then((r) => (r.ok ? r.json() : { cadence: [] }))
      .then((d) => setRows(d.cadence ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [clientId, start, end]);

  // Build a dense 7-row (Mon..Sun) × N-week grid so every day in the
  // window appears even if there were zero posts that day.
  const grid = useMemo(() => {
    const byDay = new Map(rows.map((r) => [r.day, r]));
    const startDate = startOfWeek(new Date(start + 'T00:00:00Z'));
    const endDate = new Date(end + 'T00:00:00Z');
    const weeks: Array<Array<{ day: string; count: number } | null>> = [];
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const week: Array<{ day: string; count: number } | null> = [];
      for (let i = 0; i < 7; i++) {
        const iso = cursor.toISOString().split('T')[0];
        const inRange = iso >= start && iso <= end;
        week.push(inRange ? { day: iso, count: byDay.get(iso)?.count ?? 0 } : null);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      weeks.push(week);
    }
    return weeks;
  }, [rows, start, end]);

  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  const intensity = (c: number) => {
    if (c === 0) return 'bg-white/5 border-white/5';
    const t = c / maxCount;
    if (t > 0.75) return 'bg-blue-400 border-blue-400';
    if (t > 0.5) return 'bg-blue-500/80 border-blue-500/60';
    if (t > 0.25) return 'bg-blue-500/55 border-blue-500/40';
    return 'bg-blue-500/30 border-blue-500/20';
  };

  const totalPosts = rows.reduce((s, r) => s + r.count, 0);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Posting cadence</h3>
          <p className="text-sm text-text-muted mt-0.5">
            {totalPosts} posts · {grid.length} week{grid.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-1 text-xs text-text-muted">
          <span>Less</span>
          <div className="flex gap-0.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-white/5" />
            <div className="h-2.5 w-2.5 rounded-sm bg-blue-500/30" />
            <div className="h-2.5 w-2.5 rounded-sm bg-blue-500/55" />
            <div className="h-2.5 w-2.5 rounded-sm bg-blue-500/80" />
            <div className="h-2.5 w-2.5 rounded-sm bg-blue-400" />
          </div>
          <span>More</span>
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-24" />
      ) : (
        <div className="flex gap-2">
          <div className="flex flex-col justify-around text-xs text-text-muted pr-1">
            {WEEK_DAYS.map((d) => (
              <span key={d} className="h-3 leading-3">{d}</span>
            ))}
          </div>
          <div className="flex gap-1 overflow-x-auto flex-1">
            {grid.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((cell, di) => (
                  <div
                    key={di}
                    title={cell ? `${cell.day} — ${cell.count} post${cell.count === 1 ? '' : 's'}` : ''}
                    className={`h-3 w-3 rounded-sm border ${cell ? intensity(cell.count) : 'bg-transparent border-transparent'}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
