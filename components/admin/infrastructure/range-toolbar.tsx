'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { DateRangePicker } from '@/components/reporting/date-range-picker';
import type { DateRangePreset, DateRange } from '@/lib/types/reporting';
import { resolvePresetRange } from '@/lib/reporting/date-presets';

/**
 * URL-synced wrapper around the existing reporting DateRangePicker so the
 * Infrastructure tabs can keep rendering server-side while the picker
 * drives the query window via searchParams.
 *
 * URL shape:
 *   ?preset=last_7d                      ← any named preset
 *   ?preset=custom&from=YYYY-MM-DD&to=…  ← custom range
 *
 * Server components read `preset` / `from` / `to` from searchParams and
 * call resolvePresetRange() to get the actual DateRange for data fetching.
 *
 * `router.replace` (not push) so Back doesn't walk through every range
 * change. Wrapped in useTransition so the server re-render uses the
 * existing Suspense fallback instead of blocking the UI.
 */
export function RangeToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const rawPreset = params.get('preset') as DateRangePreset | null;
  const preset: DateRangePreset = rawPreset ?? 'last_7d';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const customRange: DateRange | undefined =
    preset === 'custom' && from && to ? { start: from, end: to } : undefined;

  function pushRange(nextPreset: DateRangePreset, nextRange: DateRange) {
    const qs = new URLSearchParams(params);
    qs.set('preset', nextPreset);
    if (nextPreset === 'custom') {
      qs.set('from', nextRange.start);
      qs.set('to', nextRange.end);
    } else {
      qs.delete('from');
      qs.delete('to');
    }
    startTransition(() => {
      router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
    });
  }

  return (
    <DateRangePicker
      value={preset}
      customRange={customRange}
      onChange={(nextPreset) => {
        const resolved = resolvePresetRange(nextPreset, customRange);
        pushRange(nextPreset, resolved);
      }}
      onCustomRangeChange={(range) => pushRange('custom', range)}
    />
  );
}

/**
 * Server-side helper — mirror of RangeToolbar's URL parsing so tabs can
 * pull a DateRange out of their searchParams in one call without
 * re-implementing the preset/custom switch.
 */
export function rangeFromSearchParams(params: {
  preset?: string;
  from?: string;
  to?: string;
}): { preset: DateRangePreset; range: DateRange } {
  const preset = (params.preset ?? 'last_7d') as DateRangePreset;
  const customRange: DateRange | undefined =
    preset === 'custom' && params.from && params.to
      ? { start: params.from, end: params.to }
      : undefined;
  const range = resolvePresetRange(preset, customRange);
  return { preset, range };
}
