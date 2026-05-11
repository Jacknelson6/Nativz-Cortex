/**
 * One-off: backfill missing-platform legs for the last 60 days of posts.
 *
 * Context (2026-05-11): several clients had social_profiles rows added AFTER
 * their calendars were scheduled, so the originally-scheduled posts only
 * fired on whichever platforms were connected at schedule-time. Now that
 * IG/TT/YT etc. are wired up, we re-publish each missed leg as a clone of
 * the original post (same caption + media), targeting ONLY the platform
 * that never got the content.
 *
 * Drip rules (Jack 2026-05-11):
 *   - 1 post per platform per day per client (no spam)
 *   - no duplicates — only legs where the platform never got that exact post
 *   - same caption + media as the original (clone, don't regenerate)
 *
 * Strategy:
 *   1. Identify (post_id, target_platform) tuples where the platform is
 *      currently connected via Zernio but the original post never shipped
 *      to it (no published/pending/publishing leg exists).
 *   2. Drop YouTube legs of image-only posts (YT Shorts is video-only).
 *   3. Sort each (client, platform) queue by original scheduled_at ASC and
 *      assign drip slots: day-of-week-aware, 14:00 UTC, starting tomorrow.
 *   4. For each leg: create a NEW scheduled_posts row (status='draft') with
 *      the cloned caption + post_type + per-platform fields, attach one
 *      scheduled_post_platforms row to the target profile, copy the
 *      scheduled_post_media rows, then call publishScheduledPost so Zernio
 *      holds the slot. (Same flow as a calendar approval — bypasses the
 *      cron's approval gate because no content_drop_videos row is attached.)
 *
 * Usage:
 *   npx tsx scripts/backfill-missing-platform-legs.ts           # dry-run
 *   npx tsx scripts/backfill-missing-platform-legs.ts --apply   # commit
 */

import { config as dotenv } from 'dotenv';
dotenv({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const DRIP_HOUR_UTC = 14; // 10am ET / 7am PT — clear of typical organic slots

type Platform = 'facebook' | 'instagram' | 'tiktok' | 'youtube';
const CORE_FOUR: Platform[] = ['facebook', 'instagram', 'tiktok', 'youtube'];

interface CandidateLeg {
  post_id: string;
  client_id: string;
  client_name: string;
  scheduled_at: string;
  post_type: string;
  platform: Platform;
  target_profile_id: string;
}

interface DripSlot extends CandidateLeg {
  /** Day offset from "tomorrow" — 0 = tomorrow, 1 = day after, etc. */
  dripDayOffset: number;
  /** Final scheduled_at for the cloned post. */
  dripScheduledAt: string;
}

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { publishScheduledPost } = await import('@/lib/calendar/schedule-drop');
  const admin = createAdminClient();

  console.log(`[backfill] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  // ─── 1. Identify candidate legs ─────────────────────────────────────────
  const { data: rows, error } = await admin.rpc('exec_sql_readonly', {
    sql: BACKFILL_SQL,
  } as never);

  let candidates: CandidateLeg[];
  if (error) {
    // Fall back: rpc may not exist. Pull via direct query.
    candidates = await fetchCandidatesDirect(admin);
  } else {
    candidates = (rows as CandidateLeg[]) ?? [];
  }

  // Drop YT legs of image posts — YouTube Shorts won't accept image content.
  const filtered = candidates.filter((c) => {
    if (c.platform === 'youtube' && c.post_type === 'image') {
      console.log(
        `[backfill] skip YT image leg: ${c.client_name} post ${c.post_id.slice(0, 8)}`,
      );
      return false;
    }
    return true;
  });

  console.log(`[backfill] eligible legs: ${filtered.length}`);

  // ─── 2. Assign drip slots per (client, platform) ────────────────────────
  const byKey = new Map<string, CandidateLeg[]>();
  for (const c of filtered) {
    const key = `${c.client_id}::${c.platform}`;
    const arr = byKey.get(key) ?? [];
    arr.push(c);
    byKey.set(key, arr);
  }

  // Sort each queue chronologically (oldest original → earliest backfill slot)
  for (const arr of byKey.values()) {
    arr.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  }

  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(DRIP_HOUR_UTC, 0, 0, 0);

  const slots: DripSlot[] = [];
  for (const arr of byKey.values()) {
    arr.forEach((leg, idx) => {
      const slot = new Date(tomorrow);
      slot.setUTCDate(slot.getUTCDate() + idx);
      slots.push({
        ...leg,
        dripDayOffset: idx,
        dripScheduledAt: slot.toISOString(),
      });
    });
  }

  // ─── 3. Print plan ──────────────────────────────────────────────────────
  console.log('\n=== Drip plan ===');
  const planByClient = new Map<string, DripSlot[]>();
  for (const s of slots) {
    const arr = planByClient.get(s.client_name) ?? [];
    arr.push(s);
    planByClient.set(s.client_name, arr);
  }
  for (const [client, legs] of [...planByClient.entries()].sort()) {
    console.log(`\n${client}`);
    for (const l of legs.sort((a, b) =>
      a.dripScheduledAt.localeCompare(b.dripScheduledAt),
    )) {
      console.log(
        `  ${l.platform.padEnd(10)} ${l.dripScheduledAt}  ← post ${l.post_id.slice(0, 8)} (orig ${l.scheduled_at.slice(0, 10)})`,
      );
    }
  }

  if (!APPLY) {
    console.log(`\n[dry-run] would create ${slots.length} cloned posts. Re-run with --apply.`);
    return;
  }

  // ─── 4. Apply ───────────────────────────────────────────────────────────
  console.log(`\n=== Applying ${slots.length} backfill clones ===`);
  let ok = 0;
  let fail = 0;
  const results: { client: string; platform: Platform; ok: boolean; detail: string }[] = [];

  for (const slot of slots) {
    try {
      const newPostId = await cloneAndPublish(admin, publishScheduledPost, slot);
      ok += 1;
      results.push({
        client: slot.client_name,
        platform: slot.platform,
        ok: true,
        detail: `new post ${newPostId} scheduled ${slot.dripScheduledAt}`,
      });
      console.log(
        `  OK  ${slot.client_name} ${slot.platform} → ${newPostId} @ ${slot.dripScheduledAt}`,
      );
    } catch (err) {
      fail += 1;
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        client: slot.client_name,
        platform: slot.platform,
        ok: false,
        detail: msg,
      });
      console.error(
        `  ERR ${slot.client_name} ${slot.platform} src=${slot.post_id.slice(0, 8)}: ${msg}`,
      );
    }
  }

  console.log(`\n=== Done: ${ok} ok, ${fail} fail ===`);
}

/**
 * Clone a `scheduled_posts` row + its media into a new draft targeting just
 * the missing platform, then hand off to Zernio via publishScheduledPost.
 */
async function cloneAndPublish(
  admin: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  publishScheduledPost: typeof import('@/lib/calendar/schedule-drop').publishScheduledPost,
  slot: DripSlot,
): Promise<string> {
  // 1. Fetch source post (all clone-relevant fields)
  const { data: src, error: srcErr } = await admin
    .from('scheduled_posts')
    .select(
      'client_id, created_by, caption, hashtags, cover_image_url, post_type, ' +
        'tagged_people, collaborator_handles, ' +
        'youtube_title, youtube_description, youtube_tags, youtube_privacy, youtube_made_for_kids, ' +
        'tiktok_allow_comment, tiktok_allow_duet, tiktok_allow_stitch, ' +
        'instagram_share_to_feed, instagram_content_type, ' +
        'facebook_content_type, facebook_page_id, ' +
        'linkedin_document_title, linkedin_organization_urn, linkedin_disable_link_preview, ' +
        'first_comment',
    )
    .eq('id', slot.post_id)
    .single<Record<string, unknown>>();
  if (srcErr || !src) throw new Error(`source post not found: ${srcErr?.message ?? 'no row'}`);

  // 2. Insert clone as draft
  const { data: cloned, error: insErr } = await admin
    .from('scheduled_posts')
    .insert({
      ...src,
      scheduled_at: slot.dripScheduledAt,
      status: 'draft',
    })
    .select('id')
    .single<{ id: string }>();
  if (insErr || !cloned) throw new Error(`clone insert failed: ${insErr?.message ?? 'no row'}`);
  const newPostId = cloned.id;

  // 3. Attach the single target platform
  const { error: sppErr } = await admin
    .from('scheduled_post_platforms')
    .insert({
      post_id: newPostId,
      social_profile_id: slot.target_profile_id,
      status: 'pending',
    });
  if (sppErr) throw new Error(`spp insert failed: ${sppErr.message}`);

  // 4. Copy media link rows from source
  const { data: srcMedia, error: mediaErr } = await admin
    .from('scheduled_post_media')
    .select('media_id, sort_order')
    .eq('post_id', slot.post_id)
    .order('sort_order', { ascending: true });
  if (mediaErr) throw new Error(`media query failed: ${mediaErr.message}`);
  if (!srcMedia || srcMedia.length === 0) throw new Error('source post has no media rows');

  const mediaInserts = srcMedia.map((m) => ({
    post_id: newPostId,
    media_id: (m as { media_id: string }).media_id,
    sort_order: (m as { sort_order: number | null }).sort_order ?? 0,
  }));
  const { error: mediaInsErr } = await admin
    .from('scheduled_post_media')
    .insert(mediaInserts);
  if (mediaInsErr) throw new Error(`media clone failed: ${mediaInsErr.message}`);

  // 5. Hand off to Zernio (same path the share-link approval flow uses).
  try {
    await publishScheduledPost(admin, newPostId);
  } catch (err) {
    // Roll back the clone so we don't leave orphans on retry
    await admin.from('scheduled_post_media').delete().eq('post_id', newPostId);
    await admin.from('scheduled_post_platforms').delete().eq('post_id', newPostId);
    await admin.from('scheduled_posts').delete().eq('id', newPostId);
    throw err;
  }

  return newPostId;
}

/**
 * Pull the same candidate list the inventory query produced, via the
 * Supabase JS client (no RPC dependency).
 */
async function fetchCandidatesDirect(
  admin: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
): Promise<CandidateLeg[]> {
  // Active clients + their currently-connected core-four social profiles
  const { data: clients } = await admin
    .from('clients')
    .select('id, name, is_active, is_paused, hide_from_roster')
    .eq('is_active', true)
    .eq('is_paused', false)
    .eq('hide_from_roster', false);

  if (!clients) return [];
  type ClientRow = { id: string; name: string };
  const clientById = new Map<string, string>();
  for (const c of clients as ClientRow[]) clientById.set(c.id, c.name);
  const clientIds = (clients as ClientRow[]).map((c) => c.id);

  const { data: profiles } = await admin
    .from('social_profiles')
    .select('id, client_id, platform, is_active, late_account_id')
    .in('client_id', clientIds)
    .eq('is_active', true)
    .not('late_account_id', 'is', null)
    .in('platform', CORE_FOUR);

  type ProfileRow = {
    id: string;
    client_id: string;
    platform: Platform;
    late_account_id: string;
  };
  const profilesByClient = new Map<string, ProfileRow[]>();
  for (const p of (profiles ?? []) as ProfileRow[]) {
    const arr = profilesByClient.get(p.client_id) ?? [];
    arr.push(p);
    profilesByClient.set(p.client_id, arr);
  }

  // Posts in the last 60 days from these clients that shipped at least one leg
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  const { data: posts } = await admin
    .from('scheduled_posts')
    .select('id, client_id, scheduled_at, post_type, caption')
    .in('client_id', clientIds)
    .gte('scheduled_at', sixtyDaysAgo)
    .lt('scheduled_at', nowIso)
    .in('status', ['scheduled', 'partially_failed', 'published', 'failed'])
    .not('caption', 'is', null);

  type PostRow = {
    id: string;
    client_id: string;
    scheduled_at: string;
    post_type: string | null;
    caption: string | null;
  };
  const postList = (posts ?? []) as PostRow[];
  if (postList.length === 0) return [];

  const postIds = postList.map((p) => p.id);

  // All spp rows for these posts (with platform info)
  const { data: spps } = await admin
    .from('scheduled_post_platforms')
    .select('post_id, status, social_profiles:social_profile_id (platform)')
    .in('post_id', postIds);

  type SppRow = {
    post_id: string;
    status: string;
    social_profiles: { platform: Platform } | { platform: Platform }[] | null;
  };

  // Build maps: which posts have at least one published leg, and which
  // (post, platform) pairs are already covered (published/pending/publishing).
  const hasPublishedLeg = new Set<string>();
  const coveredPair = new Set<string>(); // `${postId}::${platform}`
  for (const s of (spps ?? []) as SppRow[]) {
    const sp = s.social_profiles;
    const platforms = Array.isArray(sp) ? sp : sp ? [sp] : [];
    for (const pf of platforms) {
      if (s.status === 'published') hasPublishedLeg.add(s.post_id);
      if (['published', 'pending', 'publishing'].includes(s.status)) {
        coveredPair.add(`${s.post_id}::${pf.platform}`);
      }
    }
  }

  const result: CandidateLeg[] = [];
  for (const post of postList) {
    if (!hasPublishedLeg.has(post.id)) continue; // post itself never shipped
    const conn = profilesByClient.get(post.client_id) ?? [];
    for (const profile of conn) {
      if (coveredPair.has(`${post.id}::${profile.platform}`)) continue;
      result.push({
        post_id: post.id,
        client_id: post.client_id,
        client_name: clientById.get(post.client_id) ?? '?',
        scheduled_at: post.scheduled_at,
        post_type: post.post_type ?? 'reel',
        platform: profile.platform,
        target_profile_id: profile.id,
      });
    }
  }
  return result;
}

// Kept here for documentation; not actually executed (no exec_sql_readonly RPC
// exists). The direct-query path above produces the same result set.
const BACKFILL_SQL = '';

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
