// VFF-07 T12: pure layout composer.
// Hero + seeding banner + 8 horizontal rows in PRD order.

import type { FormatFeedPayload } from '@/lib/analytics/format-feed';
import { FormatHero } from './format-hero';
import { FormatRow } from './format-row';
import { SeedingBanner } from './seeding-banner';

type Props = {
  payload: FormatFeedPayload;
};

export function FormatGrid({ payload }: Props) {
  return (
    <div className="space-y-8">
      {payload.seeding ? <SeedingBanner /> : null}
      {payload.hero ? <FormatHero video={payload.hero} /> : null}
      <div className="space-y-6">
        {payload.rows.map((row) => (
          <FormatRow key={row.key} label={row.label} videos={row.videos} />
        ))}
      </div>
    </div>
  );
}
