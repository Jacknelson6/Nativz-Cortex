/**
 * Infrastructure › Trend finder — single place for everything that drives
 * Trend Finder: per-platform scrape volumes + cost, live per-unit pricing
 * refresh, and the recent runs feed (moved here from the old Pipelines tab
 * on 2026-04-24 because those runs are trend-finder-only anyway).
 */

import { ScraperVolumesSection } from '@/components/settings/scraper-volumes-section';
import { TopicSearchTab } from './topic-search-tab';

export async function TrendFinderSettingsTab() {
  return (
    <div className="space-y-10">
      <ScraperVolumesSection />
      <TopicSearchTab />
    </div>
  );
}
