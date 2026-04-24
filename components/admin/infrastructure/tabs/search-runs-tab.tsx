/**
 * Usage › Search runs — topic-search run feed with success rate and stage
 * timings for the selected range. Split out from the Trend finder tab on
 * 2026-04-24 so scrape-cost config and the runs feed don't compete for
 * the same panel.
 */

import { TopicSearchTab } from './topic-search-tab';
import { RangeToolbar } from '../range-toolbar';
import { rangeFromSearchParams } from '../range-utils';

interface Props {
  preset?: string;
  from?: string;
  to?: string;
}

export async function SearchRunsTab({ preset, from, to }: Props) {
  const { preset: resolvedPreset, range } = rangeFromSearchParams({ preset, from, to });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Topic search runs</h2>
          <p className="text-[12px] text-text-muted">
            Success rate, stage timings, and recent runs — all for the range you pick.
          </p>
        </div>
        <RangeToolbar />
      </div>
      <TopicSearchTab range={range} preset={resolvedPreset} />
    </section>
  );
}
