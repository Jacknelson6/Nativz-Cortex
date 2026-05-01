import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { getPostingService } from '@/lib/posting';
import type { SocialPlatform } from '@/lib/posting/types';

const PublishDraftsSchema = z.object({
  client_id: z.string().uuid(),
});

/**
 * POST /api/scheduler/posts/publish-drafts
 *
 * Promote all draft posts with a scheduled date for a client to 'scheduled' status
 * and sync each to the Late API. Posts without Late-connected profiles are skipped.
 * Late sync errors per post are logged but non-fatal.
 *
 * @auth Required (any authenticated user)
 * @body client_id - Client UUID whose drafts to promote (required)
 * @returns {{ published: number, synced: number, message: string }}
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = PublishDraftsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Find all draft posts with a scheduled date for this client
    const { data: allDrafts, error: fetchError } = await adminClient
      .from('scheduled_posts')
      .select('id, caption, hashtags, scheduled_at, cover_image_url, tagged_people, collaborator_handles')
      .eq('client_id', parsed.data.client_id)
      .eq('status', 'draft')
      .not('scheduled_at', 'is', null);

    if (fetchError) {
      console.error('Fetch drafts error:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch drafts' }, { status: 500 });
    }

    if (!allDrafts?.length) {
      return NextResponse.json({ published: 0, message: 'No drafts to publish' });
    }

    // APPROVAL GATE — see the publish-cron's gate for context.
    //
    // Drop-derived posts (rows linked from `content_drop_videos`) MUST have
    // an approved `post_review_comments` row before we ship them. The
    // calendar scheduler shares this UI's "Publish all drafts" button for
    // admin-initiated publishes, but that button MUST NOT bypass the
    // share-link approval flow. Anything without approval is filtered out
    // here — non-drop drafts (quick-schedule, social ads, etc.) pass
    // through unchanged.
    const draftIds = allDrafts.map((d) => d.id);
    const { data: dropVideoRows } = await adminClient
      .from('content_drop_videos')
      .select('scheduled_post_id')
      .in('scheduled_post_id', draftIds);
    const dropDraftIds = new Set(
      (dropVideoRows ?? []).map(
        (r) => (r as { scheduled_post_id: string }).scheduled_post_id,
      ),
    );

    const dropDraftIdList = Array.from(dropDraftIds);
    const approvedDropDraftIds = new Set<string>();
    if (dropDraftIdList.length > 0) {
      const { data: reviewLinks } = await adminClient
        .from('post_review_links')
        .select('id, post_id')
        .in('post_id', dropDraftIdList);
      const linkIdToPostId = new Map<string, string>();
      for (const r of reviewLinks ?? []) {
        linkIdToPostId.set(
          (r as { id: string; post_id: string }).id,
          (r as { id: string; post_id: string }).post_id,
        );
      }
      if (linkIdToPostId.size > 0) {
        const { data: approvedComments } = await adminClient
          .from('post_review_comments')
          .select('review_link_id')
          .in('review_link_id', Array.from(linkIdToPostId.keys()))
          .eq('status', 'approved');
        for (const c of approvedComments ?? []) {
          const postId = linkIdToPostId.get(
            (c as { review_link_id: string }).review_link_id,
          );
          if (postId) approvedDropDraftIds.add(postId);
        }
      }
    }

    const drafts = allDrafts.filter((d) => {
      if (!dropDraftIds.has(d.id)) return true;
      return approvedDropDraftIds.has(d.id);
    });
    const skippedUnapprovedCount = allDrafts.length - drafts.length;

    if (drafts.length === 0) {
      return NextResponse.json({
        published: 0,
        skipped_unapproved: skippedUnapprovedCount,
        message:
          skippedUnapprovedCount > 0
            ? `${skippedUnapprovedCount} drop post${skippedUnapprovedCount === 1 ? '' : 's'} skipped (no approval comment).`
            : 'No drafts to publish',
      });
    }

    const postIds = drafts.map((d) => d.id);

    // Update all to scheduled
    await adminClient
      .from('scheduled_posts')
      .update({ status: 'scheduled', updated_at: new Date().toISOString() })
      .in('id', postIds);

    // Sync each to Late API
    const service = getPostingService();
    let synced = 0;

    for (const post of drafts) {
      try {
        const { data: platformLinks } = await adminClient
          .from('scheduled_post_platforms')
          .select('social_profile_id, social_profiles(id, platform, late_account_id)')
          .eq('post_id', post.id);

        const lateProfiles = (platformLinks ?? [])
          .map((pl: Record<string, unknown>) => pl.social_profiles as { id: string; platform: string; late_account_id: string | null } | null)
          .filter((p): p is { id: string; platform: string; late_account_id: string } => !!p?.late_account_id);

        if (lateProfiles.length === 0) continue;

        const { data: mediaRows } = await adminClient
          .from('scheduled_post_media')
          .select('scheduler_media(late_media_url)')
          .eq('post_id', post.id)
          .limit(1);

        const mediaUrl = ((mediaRows?.[0] as Record<string, unknown>)?.scheduler_media as Record<string, unknown> | null)?.late_media_url as string ?? '';

        const lateResult = await service.publishPost({
          videoUrl: mediaUrl,
          caption: post.caption ?? '',
          hashtags: post.hashtags ?? [],
          platformProfileIds: lateProfiles.map(p => p.late_account_id),
          platformHints: Object.fromEntries(
            lateProfiles.map(p => [p.late_account_id, p.platform as SocialPlatform])
          ),
          scheduledAt: post.scheduled_at ?? undefined,
          coverImageUrl: post.cover_image_url ?? undefined,
          taggedPeople: post.tagged_people ?? [],
          collaboratorHandles: post.collaborator_handles ?? [],
        });

        await adminClient
          .from('scheduled_posts')
          .update({ late_post_id: lateResult.externalPostId })
          .eq('id', post.id);

        synced++;
      } catch (lateErr) {
        console.error(`Late sync error for post ${post.id}:`, lateErr);
      }
    }

    return NextResponse.json({
      published: postIds.length,
      synced,
      skipped_unapproved: skippedUnapprovedCount,
      message:
        skippedUnapprovedCount > 0
          ? `${postIds.length} draft${postIds.length === 1 ? '' : 's'} set to publish; ${skippedUnapprovedCount} drop post${skippedUnapprovedCount === 1 ? '' : 's'} skipped (no approval comment).`
          : `${postIds.length} draft${postIds.length === 1 ? '' : 's'} set to publish`,
    });
  } catch (error) {
    console.error('POST /api/scheduler/posts/publish-drafts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
