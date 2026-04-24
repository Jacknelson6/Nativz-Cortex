/**
 * Shared range-resolution helper. Separate from range-toolbar.tsx because
 * that file is 'use client' — exporting this from there marks it as a
 * client function, which the server-rendered Cost / Trend finder tabs
 * can't import. Keeping it here as a plain module lets both sides share.
 */

import type { DateRangePreset, DateRange } from '@/lib/types/reporting';
import { resolvePresetRange } from '@/lib/reporting/date-presets';

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
