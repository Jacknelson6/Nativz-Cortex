/**
 * When a new social account connects, automatically attach it as a platform
 * leg to every existing scheduled/draft post for the client that hasn't
 * been submitted to Zernio yet (`late_post_id IS NULL`).
 *
 * Posts that have already been submitted to Zernio (`late_post_id` set)
 * are skipped — those need cloning, which has visible side effects
 * (re-publishing old content) so we leave it to the manual "Add platform"
 * dialog where a human picks which old posts to fan out.
 *
 * Net behaviour from a client's POV: connect TikTok mid-month → every
 * upcoming post in their calendar automatically also goes to TikTok.
 *
 * Idempotent via the unique index `scheduled_post_platforms_post_profile_uniq`
 * (migration 268). Safe to retry on webhook redelivery.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AutoBackfillResult {
  /** Posts examined (had no leg for this profile and were eligible). */
  candidates: number;
  /** Legs actually inserted. */
  inserted: number;
  /** Legs skipped because of unique-violation (already there). */
  skipped: number;
}

/**
 * Add the new social profile as a `pending` leg on every eligible post.
 *
 * Eligibility: status in ('scheduled', 'draft') AND late_post_id IS NULL.
 * Drafts that don't have `scheduled_at` set are included but harmless —
 * they won't fire until promoted to `scheduled`.
 */
export async function autoBackfillNewPlatform(opts: {
  admin: SupabaseClient;
  clientId: string;
  socialProfileId: string;
}): Promise<AutoBackfillResult> {
  const { admin, clientId, socialProfileId } = opts;

  // Pull every eligible post + their existing legs for this profile.
  // Filter on `late_post_id IS NULL` so we never try to mutate a post
  // that's already in Zernio's hands.
  const { data: posts, error: postsErr } = await admin
    .from('scheduled_posts')
    .select('id')
    .eq('client_id', clientId)
    .is('late_post_id', null)
    .in('status', ['scheduled', 'draft']);

  if (postsErr) {
    console.error('[auto-backfill] posts query failed:', postsErr);
    return { candidates: 0, inserted: 0, skipped: 0 };
  }
  if (!posts || posts.length === 0) {
    return { candidates: 0, inserted: 0, skipped: 0 };
  }

  // Find which of those already have a leg for this social profile so we
  // can give the caller an accurate count without relying on the unique
  // index swallowing duplicates silently.
  const postIds = posts.map((p) => p.id as string);
  const { data: existingLegs, error: legsErr } = await admin
    .from('scheduled_post_platforms')
    .select('post_id')
    .eq('social_profile_id', socialProfileId)
    .in('post_id', postIds);

  if (legsErr) {
    console.error('[auto-backfill] existing legs query failed:', legsErr);
    return { candidates: 0, inserted: 0, skipped: 0 };
  }

  const alreadyHas = new Set((existingLegs ?? []).map((l) => l.post_id as string));
  const toInsert = postIds.filter((id) => !alreadyHas.has(id));

  if (toInsert.length === 0) {
    return { candidates: posts.length, inserted: 0, skipped: alreadyHas.size };
  }

  const { error: insertErr, count } = await admin
    .from('scheduled_post_platforms')
    .insert(
      toInsert.map((post_id) => ({
        post_id,
        social_profile_id: socialProfileId,
        status: 'pending',
      })),
      { count: 'exact' },
    );

  // Unique-violation paths land in the swallow-and-continue branch since
  // the index is the safety net for genuine race conditions.
  if (insertErr && !insertErr.message.includes('duplicate')) {
    console.error('[auto-backfill] insert failed:', insertErr);
    return { candidates: posts.length, inserted: 0, skipped: alreadyHas.size };
  }

  return {
    candidates: posts.length,
    inserted: count ?? toInsert.length,
    skipped: alreadyHas.size,
  };
}
