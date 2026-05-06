import type { SupabaseClient } from '@supabase/supabase-js';
import { getPostingService } from '@/lib/posting';

/**
 * Pull the per-platform breakdown from Zernio and write it into
 * `scheduled_post_platforms`. Idempotent and safe to re-run.
 *
 * Why this lives in shared lib: both the webhook handler (synchronous on
 * Zernio's terminal events) and the daily reconciler (catches state drift
 * when a webhook is dropped or Zernio's stored record diverges from reality)
 * need exactly the same write path.
 *
 * Never downgrades a leg that's already `published`. Zernio's webhook can
 * arrive after we've reconciled from a different `late_post_id` (per-leg
 * retry creates new Zernio posts; older legs keep their existing
 * `external_post_url`). Stomping would erase the public URL.
 */
export async function syncPlatformRowsFromZernio(
  adminClient: SupabaseClient,
  latePostId: string,
): Promise<void> {
  const { data: parent } = await adminClient
    .from('scheduled_posts')
    .select('id')
    .eq('late_post_id', latePostId)
    .maybeSingle();
  if (!parent) {
    console.warn(`[zernio-reconcile] no scheduled_posts row for late_post_id=${latePostId}`);
    return;
  }
  const { data: sppRows } = await adminClient
    .from('scheduled_post_platforms')
    .select(
      'id, social_profile_id, status, external_post_url, social_profiles:social_profile_id (late_account_id, platform)',
    )
    .eq('post_id', (parent as { id: string }).id);
  if (!sppRows?.length) return;

  type Spp = {
    id: string;
    social_profile_id: string;
    status: string;
    external_post_url: string | null;
    social_profiles:
      | { late_account_id: string | null; platform: string | null }
      | { late_account_id: string | null; platform: string | null }[]
      | null;
  };
  const sppByLateId = new Map<string, Spp>();
  for (const row of sppRows as Spp[]) {
    const sp = row.social_profiles;
    const flat = Array.isArray(sp) ? sp : sp ? [sp] : [];
    for (const x of flat) {
      if (x.late_account_id) sppByLateId.set(x.late_account_id, row);
    }
  }
  if (sppByLateId.size === 0) return;

  const service = getPostingService();
  const status = await service.getPostStatus(latePostId);

  for (const platform of status.platforms) {
    const spp = sppByLateId.get(platform.profileId);
    if (!spp) continue;
    if (spp.status === 'published' && platform.status !== 'published') continue;
    // Map Zernio's three-state (`published` | `scheduled` | `failed`) onto our
    // local spp status. Critically: a `scheduled` future leg must stay
    // `pending`, NOT collapse to `failed`. The previous ternary
    // (`platform.status === 'published' ? 'published' : 'failed'`) stamped
    // every future-dated leg as failed the first time the daily reconciler
    // ran, which is what fired the May 6 mass post-health alert.
    let nextStatus: string;
    if (platform.status === 'published') nextStatus = 'published';
    else if (platform.status === 'failed') nextStatus = 'failed';
    else nextStatus = 'pending';
    await adminClient
      .from('scheduled_post_platforms')
      .update({
        status: nextStatus,
        external_post_id: platform.externalPostId ?? null,
        external_post_url: platform.externalPostUrl ?? null,
        failure_reason: platform.status === 'failed' ? platform.error ?? null : null,
      })
      .eq('id', spp.id);
  }
}

/**
 * Derive parent post status from per-leg statuses after a sync.
 *
 *  - All legs published → `published`
 *  - Any failed + any published → `partially_failed`
 *  - All failed → `failed`
 *  - Any pending → leave parent alone (cron will resolve it)
 *
 * Never downgrades `published` to anything else.
 */
export async function reconcileParentStatusFromSpp(
  adminClient: SupabaseClient,
  latePostId: string,
): Promise<void> {
  const { data: parent } = await adminClient
    .from('scheduled_posts')
    .select('id, status, retry_count, scheduled_at')
    .eq('late_post_id', latePostId)
    .maybeSingle();
  if (!parent) return;

  const { data: rows } = await adminClient
    .from('scheduled_post_platforms')
    .select('status')
    .eq('post_id', (parent as { id: string }).id);
  const statuses = (rows ?? []).map((r) => (r as { status: string }).status);
  if (statuses.length === 0) return;

  const allPublished = statuses.every((s) => s === 'published');
  const anyPending = statuses.some((s) => s === 'pending');
  const anyFailed = statuses.some((s) => s === 'failed');
  const anyPublished = statuses.some((s) => s === 'published');
  const currentStatus = (parent as { status: string }).status;

  if (currentStatus === 'published' && !allPublished) return;
  if (anyPending) return;

  let next: 'published' | 'partially_failed' | 'failed' | null = null;
  if (allPublished) next = 'published';
  else if (anyFailed && anyPublished) next = 'partially_failed';
  else if (anyFailed && !anyPublished) next = 'failed';

  if (!next || next === currentStatus) return;

  const update: Record<string, unknown> = {
    status: next,
    updated_at: new Date().toISOString(),
  };
  if (next === 'published') {
    update.published_at = new Date().toISOString();
    update.failure_reason = null;
  }
  await adminClient
    .from('scheduled_posts')
    .update(update)
    .eq('id', (parent as { id: string }).id);
}
