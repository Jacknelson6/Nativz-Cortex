import { createAdminClient } from '@/lib/supabase/admin';
import {
  CONTENT_PRODUCTION_SOP_SLIDES,
  VIDEO_CONTENT_SOP_SEED_VERSION,
} from '@/lib/presentations/content-production-sop-slides';

type AdminClient = ReturnType<typeof createAdminClient>;

/** Tag on the pre-built video content SOP deck (Gamma-style included presentation). */
export const CONTENT_PRODUCTION_SOP_SEED_TAG = 'cortex-seed-content-production-sop';

/** DB key in `workspace_seed_suppressions` when the user deletes the included deck (stops auto-reinsert). */
export const CONTENT_PRODUCTION_SOP_SUPPRESSION_KEY = 'content-production-sop';

const SEED_TITLE = 'Video content production SOP';
const SEED_DESCRIPTION =
  'Included deck — Nativz video & video creative pipeline (brief through boost). Edit like any presentation.';

/**
 * Ensures the default video content SOP slide deck exists and stays up to date when `VIDEO_CONTENT_SOP_SEED_VERSION` bumps.
 */
export async function ensureContentProductionSopPresentation(
  adminClient: AdminClient,
  createdByUserId: string,
): Promise<void> {
  const { data: existing, error: selectError } = await adminClient
    .from('presentations')
    .select('id, audit_data')
    .contains('tags', [CONTENT_PRODUCTION_SOP_SEED_TAG])
    .limit(1)
    .maybeSingle();

  if (selectError) {
    console.error('ensureContentProductionSopPresentation select:', selectError);
    return;
  }

  if (existing) {
    const prev = (existing.audit_data as Record<string, unknown> | null) ?? {};
    const currentVersion = Number(prev.seed_version ?? 0);
    if (currentVersion >= VIDEO_CONTENT_SOP_SEED_VERSION) return;

    const { error: updateError } = await adminClient
      .from('presentations')
      .update({
        title: SEED_TITLE,
        description: SEED_DESCRIPTION,
        slides: CONTENT_PRODUCTION_SOP_SLIDES,
        audit_data: { ...prev, seed_version: VIDEO_CONTENT_SOP_SEED_VERSION },
      })
      .eq('id', existing.id);

    if (updateError) {
      console.error('ensureContentProductionSopPresentation update:', updateError);
    }
    return;
  }

  const { data: suppressed, error: supErr } = await adminClient
    .from('workspace_seed_suppressions')
    .select('seed_key')
    .eq('seed_key', CONTENT_PRODUCTION_SOP_SUPPRESSION_KEY)
    .maybeSingle();

  if (supErr) {
    console.error('ensureContentProductionSopPresentation suppression check:', supErr);
  }
  if (suppressed) return;

  const { error: insertError } = await adminClient.from('presentations').insert({
    title: SEED_TITLE,
    description: SEED_DESCRIPTION,
    type: 'slides',
    client_id: null,
    created_by: createdByUserId,
    slides: CONTENT_PRODUCTION_SOP_SLIDES,
    tags: [CONTENT_PRODUCTION_SOP_SEED_TAG, 'content-production', 'video'],
    status: 'ready',
    tiers: [],
    tier_items: [],
    audit_data: { seed_version: VIDEO_CONTENT_SOP_SEED_VERSION },
  });

  if (insertError) {
    console.error('ensureContentProductionSopPresentation insert:', insertError);
  }
}

/** Sort so the included SOP deck appears first, then newest updated (Gamma-style). */
export function sortPresentationsWithSeedFirst<T extends { tags?: string[]; updated_at?: string }>(rows: T[]): T[] {
  const seed = CONTENT_PRODUCTION_SOP_SEED_TAG;
  return [...rows].sort((a, b) => {
    const aSeed = a.tags?.includes(seed) ? 1 : 0;
    const bSeed = b.tags?.includes(seed) ? 1 : 0;
    if (aSeed !== bSeed) return bSeed - aSeed;
    const aT = new Date(a.updated_at ?? 0).getTime();
    const bT = new Date(b.updated_at ?? 0).getTime();
    return bT - aT;
  });
}
