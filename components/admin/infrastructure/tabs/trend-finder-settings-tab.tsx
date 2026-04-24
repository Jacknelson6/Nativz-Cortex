/**
 * Infrastructure › Trend finder — single place for everything that drives
 * Trend Finder: per-platform scrape volumes + cost, live per-unit pricing
 * refresh, and the recent runs feed (moved here from the old Pipelines tab
 * on 2026-04-24 because those runs are trend-finder-only anyway).
 *
 * Accepts the shared range searchParams so the topic-search stats can
 * follow the same DateRangePicker the Cost tab uses.
 */

import { ScraperVolumesSection } from '@/components/settings/scraper-volumes-section';
import { TopicSearchTab } from './topic-search-tab';
import { RangeToolbar } from '../range-toolbar';
import { rangeFromSearchParams } from '../range-utils';

interface Props {
  preset?: string;
  from?: string;
  to?: string;
}

export async function TrendFinderSettingsTab({ preset, from, to }: Props) {
  const { preset: resolvedPreset, range } = rangeFromSearchParams({ preset, from, to });

  return (
    <div className="space-y-10">
      <ScraperVolumesSection />
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
    </div>
  );
}
