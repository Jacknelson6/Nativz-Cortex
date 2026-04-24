import { KnowledgeExplorer } from './knowledge-explorer';
import { getActiveAdminClient } from '@/lib/admin/get-active-client';

/**
 * Brain (Knowledge) lives under the sidebar's "Brand tools" section, so
 * the explorer opens scoped to whichever brand is pinned in the top-bar
 * pill. When nothing's pinned, it opens on the agency-wide "all" filter.
 * Visitor can still change the filter in-place from the dropdown inside
 * the explorer.
 */
export default async function KnowledgePage() {
  const active = await getActiveAdminClient().catch(() => null);
  const initialClientFilter = active?.brand?.id ?? 'all';

  return <KnowledgeExplorer initialClientFilter={initialClientFilter} />;
}
