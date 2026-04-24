/**
 * Usage › Trend finder — per-platform scrape volumes and live per-unit
 * pricing. Recent runs + stage timings moved to the Search runs tab on
 * 2026-04-24 because mixing scrape-cost config with a runs feed on one
 * panel made neither scannable.
 */

import { ScraperVolumesSection } from '@/components/settings/scraper-volumes-section';

export async function TrendFinderSettingsTab() {
  return (
    <div className="space-y-10">
      <ScraperVolumesSection />
    </div>
  );
}
