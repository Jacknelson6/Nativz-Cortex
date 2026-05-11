import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { z } from 'zod';
import type { SocialPlatform } from '@/lib/posting/types';
import { nextFreeSlot } from '@/lib/calendar/scheduling-rules';

const Schema = z.object({
  post_ids: z.array(z.string().uuid()).min(1),
  social_profile_ids: z.array(z.string().uuid()).min(1),
  /**
   * For posts that have already been submitted to Zernio (`late_post_id` set,
   * status = published / partially_failed), we can't add a leg in place — the
   * Zernio post is immutable on their end. Instead we clone the post with
   * only the new legs attached. `clone_offset_minutes` controls how far in
   * the future the clones are scheduled to start, so we don't fire 6
   * back-dated posts to IG simultaneously and trip rate-limit / spam
   * detection. Clones are spaced this many minutes apart starting now +
   * offset.
   */
  clone_offset_minutes: z.number().int().min(0).max(7 * 24 * 60).default(15),
  clone_spacing_minutes: z.number().int().min(0).max(60 * 24).default(60),
});

type AddResult =
  | { post_id: string; mode: 'inplace'; added_profile_ids: string[]; skipped_profile_ids: string[] }
  | { post_id: string; mode: 'cloned'; new_post_id: string; scheduled_at: string; added_profile_ids: string[] }
  | { post_id: string; mode: 'skipped'; reason: string };

/**
 * POST /api/scheduler/posts/add-platforms
 *
 * Add one or more social profiles to one or more existing scheduled posts.
 * The right thing happens automatically depending on whether the post has
 * already shipped:
 *
 * - **Not yet shipped** (no `late_post_id`, status in draft/scheduled/failed)
 *   → adds platform legs in place; cron picks them up on the next tick.
 * - **Already shipped** (any leg has `external_post_id`, or post has
 *   `late_post_id`) → clones the post with only the new legs attached,
 *   schedules the clones at `now + clone_offset_minutes`, spaced
 *   `clone_spacing_minutes` apart so we don't dump them all at once.
 *
 * All inserts use ON CONFLICT DO NOTHING (via the unique index from
 * migration 268) so retries are idempotent.
 *
 * Built for the "client just connected a new platform mid-month" case
 * (e.g. Avondale connecting IG after the May calendar was already
 * populated).
 *
 * @auth Admin only — viewers can edit caption/timing on their own posts but
 *       fanning a post out to a new platform is a strategist-level action.
 * @body post_ids - UUIDs of scheduled posts
 * @body social_profile_ids - UUIDs of social profiles to add
 * @body clone_offset_minutes - Minutes from now to schedule first clone (default 15)
 * @body clone_spacing_minutes - Minutes between successive clones (default 60)
 * @returns {{ results: AddResult[] }}
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await isAdmin(user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { post_ids, social_profile_ids, clone_offset_minutes, clone_spacing_minutes } = parsed.data;

    const admin = createAdminClient();

    // Pull every post + every leg + every profile in 3 round-trips so we
    // can validate clients match before touching anything.
    const [postsRes, legsRes, profilesRes, mediaLinksRes] = await Promise.all([
      admin
        .from('scheduled_posts')
        .select('id, client_id, status, scheduled_at, late_post_id, caption, hashtags, cover_image_url, tagged_people, collaborator_handles, post_type, title, youtube_title, youtube_description, youtube_tags, youtube_privacy, youtube_made_for_kids, tiktok_allow_comment, tiktok_allow_duet, tiktok_allow_stitch, instagram_share_to_feed, instagram_content_type, facebook_content_type, facebook_page_id, linkedin_document_title, linkedin_organization_urn, linkedin_disable_link_preview, first_comment')
        .in('id', post_ids),
      admin
        .from('scheduled_post_platforms')
        .select('post_id, social_profile_id, status, external_post_id')
        .in('post_id', post_ids),
      admin
        .from('social_profiles')
        .select('id, client_id, platform, late_account_id')
        .in('id', social_profile_ids),
      admin
        .from('scheduled_post_media')
        .select('post_id, media_id, sort_order')
        .in('post_id', post_ids),
    ]);

    if (postsRes.error || legsRes.error || profilesRes.error || mediaLinksRes.error) {
      console.error('add-platforms fetch error:', postsRes.error, legsRes.error, profilesRes.error, mediaLinksRes.error);
      return NextResponse.json({ error: 'Failed to load posts' }, { status: 500 });
    }

    const posts = postsRes.data ?? [];
    const legs = legsRes.data ?? [];
    const profiles = profilesRes.data ?? [];
    const mediaLinks = mediaLinksRes.data ?? [];

    if (posts.length === 0) {
      return NextResponse.json({ error: 'No matching posts' }, { status: 404 });
    }
    if (profiles.length === 0) {
      return NextResponse.json({ error: 'No matching social profiles' }, { status: 404 });
    }

    // All posts must belong to the same client as the profiles, otherwise
    // we'd be silently fanning across brands.
    const clientIds = new Set([...posts.map(p => p.client_id), ...profiles.map(p => p.client_id)]);
    if (clientIds.size !== 1) {
      return NextResponse.json(
        { error: 'Posts and profiles must all belong to the same client' },
        { status: 400 },
      );
    }

    const legsByPost = new Map<string, typeof legs>();
    for (const leg of legs) {
      const arr = legsByPost.get(leg.post_id) ?? [];
      arr.push(leg);
      legsByPost.set(leg.post_id, arr);
    }
    const mediaByPost = new Map<string, typeof mediaLinks>();
    for (const link of mediaLinks) {
      const arr = mediaByPost.get(link.post_id) ?? [];
      arr.push(link);
      mediaByPost.set(link.post_id, arr);
    }

    const results: AddResult[] = [];
    let cloneCounter = 0;

    for (const post of posts) {
      const postLegs = legsByPost.get(post.id) ?? [];
      const alreadyShipped =
        !!post.late_post_id ||
        postLegs.some(l => l.status === 'published' || l.status === 'publishing' || !!l.external_post_id);

      const existingProfileIds = new Set(postLegs.map(l => l.social_profile_id));
      const toAdd = profiles.filter(p => !existingProfileIds.has(p.id));

      if (toAdd.length === 0) {
        results.push({ post_id: post.id, mode: 'skipped', reason: 'All requested profiles already attached' });
        continue;
      }

      if (!alreadyShipped) {
        // In-place add. Unique index makes the insert idempotent on
        // double-clicks; we still pre-filter to keep the response truthful
        // about what we actually inserted.
        const { error: insertErr } = await admin
          .from('scheduled_post_platforms')
          .insert(
            toAdd.map(p => ({
              post_id: post.id,
              social_profile_id: p.id,
              status: 'pending',
            })),
          );
        if (insertErr && !insertErr.message.includes('duplicate')) {
          console.error('add-platforms insert error:', insertErr);
          results.push({ post_id: post.id, mode: 'skipped', reason: insertErr.message });
          continue;
        }

        // If the post was a draft and the user is now adding a real platform
        // leg, lift it to scheduled so the cron will actually fire it. We
        // only do this when scheduled_at is set, otherwise it stays a draft.
        if (post.status === 'draft' && post.scheduled_at) {
          await admin
            .from('scheduled_posts')
            .update({ status: 'scheduled' })
            .eq('id', post.id);
        }

        results.push({
          post_id: post.id,
          mode: 'inplace',
          added_profile_ids: toAdd.map(p => p.id),
          skipped_profile_ids: profiles.filter(p => existingProfileIds.has(p.id)).map(p => p.id),
        });
        continue;
      }

      // Already shipped: clone the post with only the new legs.
      const baseSlot = new Date(
        Date.now() + clone_offset_minutes * 60_000 + cloneCounter * clone_spacing_minutes * 60_000,
      ).toISOString();
      cloneCounter += 1;

      // Walk the clone forward if any of the new legs would collide with
      // an existing scheduled post on the same (client, platform) Central day.
      // The 1/(client, platform)/day rule applies to clones too: even
      // though this flow is "intentionally creating a new post," the
      // platforms it targets aren't supposed to double up.
      const clonePlatforms = toAdd
        .map((p) => p.platform as SocialPlatform)
        .filter((p): p is SocialPlatform => typeof p === 'string');
      const { scheduledAt: cloneScheduledAt } = await nextFreeSlot(admin, {
        clientId: post.client_id,
        platforms: clonePlatforms,
        scheduledAt: baseSlot,
      });

      const { data: clone, error: cloneErr } = await admin
        .from('scheduled_posts')
        .insert({
          client_id: post.client_id,
          created_by: user.id,
          status: 'scheduled',
          scheduled_at: cloneScheduledAt,
          caption: post.caption,
          hashtags: post.hashtags,
          cover_image_url: post.cover_image_url,
          tagged_people: post.tagged_people,
          collaborator_handles: post.collaborator_handles,
          post_type: post.post_type,
          title: post.title,
          // Per-platform overrides — preserve the originals; the Zernio
          // router only applies the field for legs whose platform actually
          // attaches, so unrelated overrides are harmless on the clone.
          youtube_title: post.youtube_title,
          youtube_description: post.youtube_description,
          youtube_tags: post.youtube_tags,
          youtube_privacy: post.youtube_privacy,
          youtube_made_for_kids: post.youtube_made_for_kids,
          tiktok_allow_comment: post.tiktok_allow_comment,
          tiktok_allow_duet: post.tiktok_allow_duet,
          tiktok_allow_stitch: post.tiktok_allow_stitch,
          instagram_share_to_feed: post.instagram_share_to_feed,
          instagram_content_type: post.instagram_content_type,
          facebook_content_type: post.facebook_content_type,
          facebook_page_id: post.facebook_page_id,
          linkedin_document_title: post.linkedin_document_title,
          linkedin_organization_urn: post.linkedin_organization_urn,
          linkedin_disable_link_preview: post.linkedin_disable_link_preview,
          first_comment: post.first_comment,
        })
        .select('id')
        .single();

      if (cloneErr || !clone) {
        console.error('add-platforms clone error:', cloneErr);
        results.push({ post_id: post.id, mode: 'skipped', reason: cloneErr?.message ?? 'clone failed' });
        cloneCounter -= 1; // didn't actually use this slot
        continue;
      }

      // Attach only the new legs to the clone.
      const { error: legInsertErr } = await admin
        .from('scheduled_post_platforms')
        .insert(
          toAdd.map(p => ({
            post_id: clone.id,
            social_profile_id: p.id,
            status: 'pending',
          })),
        );
      if (legInsertErr) {
        console.error('add-platforms clone-leg error:', legInsertErr);
        // Roll back the orphan clone so we don't leave an empty post sitting
        // in the calendar with no legs.
        await admin.from('scheduled_posts').delete().eq('id', clone.id);
        results.push({ post_id: post.id, mode: 'skipped', reason: legInsertErr.message });
        cloneCounter -= 1;
        continue;
      }

      // Attach the same media in the same order — IG needs the actual asset,
      // not just a caption.
      const sourceMedia = mediaByPost.get(post.id) ?? [];
      if (sourceMedia.length > 0) {
        const { error: mediaErr } = await admin
          .from('scheduled_post_media')
          .insert(
            sourceMedia.map(m => ({
              post_id: clone.id,
              media_id: m.media_id,
              sort_order: m.sort_order,
            })),
          );
        if (mediaErr) {
          console.error('add-platforms clone-media error:', mediaErr);
          // Best-effort: leave the clone in place but warn. Operator can
          // re-attach media via the post editor.
        }
      }

      results.push({
        post_id: post.id,
        mode: 'cloned',
        new_post_id: clone.id,
        scheduled_at: cloneScheduledAt,
        added_profile_ids: toAdd.map(p => p.id),
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('POST /api/scheduler/posts/add-platforms error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
