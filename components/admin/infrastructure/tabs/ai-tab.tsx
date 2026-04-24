/**
 * Infrastructure › AI — the Usage dashboard, full bleed.
 *
 * Previously this tab carried a provider-roll-up card and a separate
 * 7-day-stats strip above the UsageDashboard, but the overlap with the
 * dashboard's own "Top models" / "Where each model is used" sections made
 * the page feel repetitive. The signal lives inside UsageDashboard now:
 * cost-first summary tiles, a reconciliation indicator (confidence in the
 * numbers), a per-model daily chart, the top-models list, and the
 * feature-×-model table.
 */

import { UsageDashboard } from '@/components/settings/usage-dashboard';

export function AiTab() {
  return <UsageDashboard />;
}
