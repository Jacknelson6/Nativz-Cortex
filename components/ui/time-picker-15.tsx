'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils/cn';

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const MINUTES = [0, 15, 30, 45] as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseHHMM(v: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const hour = Number.parseInt(m[1], 10);
  const minute = Number.parseInt(m[2], 10);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function snapToQuarter(minute: number): (typeof MINUTES)[number] {
  let best: (typeof MINUTES)[number] = 0;
  let bestD = 999;
  for (const q of MINUTES) {
    const d = Math.abs(q - minute);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

function from24h(hour: number, minute: number): { h12: number; minute: (typeof MINUTES)[number]; pm: boolean } {
  const pm = hour >= 12;
  const h12 = hour % 12 || 12;
  return { h12, minute: snapToQuarter(minute), pm };
}

function to24hHour(h12: number, pm: boolean): number {
  if (!pm) return h12 === 12 ? 0 : h12;
  return h12 === 12 ? 12 : h12 + 12;
}

function formatTime12(hour24: number, minute: number): string {
  const { h12, pm } = from24h(hour24, minute);
  return `${pad2(h12)}:${pad2(minute)} ${pm ? 'PM' : 'AM'}`;
}

type TimePicker15Props = {
  value: string;
  onChange: (hhmm: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
};

function ScrollColumn<T extends string | number>({
  items,
  selected,
  onSelect,
  format,
  className,
}: {
  items: readonly T[];
  selected: T;
  onSelect: (item: T) => void;
  format: (item: T) => string;
  className?: string;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'center' });
  }, [selected]);

  return (
    <div
      className={cn(
        'max-h-[220px] w-[4.25rem] shrink-0 overflow-y-auto overscroll-contain border-l border-nativz-border/80 py-2',
        className,
      )}
    >
      {items.map((item) => {
        const isSel = item === selected;
        return (
          <button
            key={String(item)}
            ref={isSel ? selectedRef : undefined}
            type="button"
            onClick={() => onSelect(item)}
            className={cn(
              'flex h-9 w-full items-center justify-center text-sm font-medium transition-colors',
              isSel
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
            )}
          >
            {format(item)}
          </button>
        );
      })}
    </div>
  );
}

export function TimePicker15({ value, onChange, disabled, id, className }: TimePicker15Props) {
  const [open, setOpen] = useState(false);

  const parsed = useMemo(() => parseHHMM(value), [value]);
  const parts = useMemo(() => {
    if (!parsed) return from24h(14, 0);
    return from24h(parsed.hour, parsed.minute);
  }, [parsed]);

  const [h12, setH12] = useState(parts.h12);
  const [minute, setMinute] = useState<(typeof MINUTES)[number]>(parts.minute);
  const [pm, setPm] = useState(parts.pm);

  useEffect(() => {
    setH12(parts.h12);
    setMinute(parts.minute);
    setPm(parts.pm);
  }, [parts.h12, parts.minute, parts.pm]);

  function commit(nextH12: number, nextMin: (typeof MINUTES)[number], nextPm: boolean) {
    const h24 = to24hHour(nextH12, nextPm);
    onChange(`${pad2(h24)}:${pad2(nextMin)}`);
  }

  const display =
    parsed || value
      ? formatTime12(parsed?.hour ?? 14, parsed?.minute ?? 0)
      : 'Select time';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-10 w-full max-w-xs items-center justify-between gap-2 rounded-lg border border-nativz-border bg-surface-hover px-3 text-sm text-text-primary',
            'focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            open && 'border-accent/50 ring-1 ring-accent/20',
            className,
          )}
        >
          <span className="tabular-nums">{display}</span>
          <Clock size={16} className="shrink-0 text-text-muted" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        matchAnchorWidth={false}
        className="w-auto overflow-hidden p-0"
      >
        <div className="flex rounded-xl bg-surface">
          <ScrollColumn
            className="border-l-0"
            items={HOURS_12}
            selected={h12}
            onSelect={(n) => {
              setH12(n);
              commit(n, minute, pm);
            }}
            format={(h) => pad2(h)}
          />
          <ScrollColumn
            items={[...MINUTES]}
            selected={minute}
            onSelect={(m) => {
              setMinute(m);
              commit(h12, m, pm);
            }}
            format={(m) => pad2(m)}
          />
          <ScrollColumn
            items={['AM', 'PM'] as const}
            selected={pm ? 'PM' : 'AM'}
            onSelect={(p) => {
              const nextPm = p === 'PM';
              setPm(nextPm);
              commit(h12, minute, nextPm);
            }}
            format={(p) => p}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
