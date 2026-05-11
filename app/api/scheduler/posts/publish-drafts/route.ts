import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
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
 * and sync each to the Late API. Drop-derived drafts without a client approval
 * comment get a synthetic admin-attributed approval comment minted in-place
 * (same escape hatch as the per-post /force-approve route), so the admin's
 * explicit "set drafts to auto-publish" action does what it says on the tin.
 * Posts without Late-connected profiles are skipped during sync. Late sync
 * errors per post are logged but non-fatal.
 *
 * @auth Admin only
 * @body client_id - Client UUID whose drafts to promote (required)
 * @returns {{ published: number, synced: number, force_approved: number, message: string }}
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
    const parsed = PublishDraftsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Find all draft posts with a scheduled date for this client.
    // Pull per-platform overrides (migration 218) so YouTube titles,
    // TikTok interaction settings, etc. survive the bulk publish.
    const { data: allDrafts, error: fetchError } = await adminClient
      .from('scheduled_posts')
      .select('id, caption, hashtags, scheduled_at, cover_image_url, tagged_people, collaborator_handles, youtube_title, youtube_description, youtube_tags, youtube_privacy, youtube_made_for_kids, tiktok_allow_comment, tiktok_allow_duet, tiktok_allow_stitch, instagram_share_to_feed, instagram_content_type, facebook_content_type, facebook_page_id, linkedin_document_title, linkedin_organization_urn, linkedin_disable_link_preview, first_comment')
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
    // an approved `post_review_comments` row before the cron ships them.
    // This bulk action is admin-only and explicitly labelled "Set drafts to
    // auto-publish", so it functions as the bulk equivalent of the per-post
    // /force-approve escape hatch: for any drop drafts missing an approval
    // comment, we mint a synthetic one attributed to the admin and proceed.
    // Non-drop drafts (quick-schedule, social ads, etc.) pass through with
    // no synthetic approval needed.
    const draftIds = allDrafts.map((d) => d.id);
    const { data: dropVideoRows } = await adminClient
      .from('content_drop_videos')
      .select('scheduled_post_id')
      .in('scheduled_post_id', draftIds);
    const dropDraftIds = new Set(
      (dropVideoRows ?? [])
        .map((r) => (r as { scheduled_post_id: string }).scheduled_post_id)
        .filter((id): id is string => !!id),
    );

    const dropDraftIdList = Array.from(dropDraftIds);
    const approvedDropDraftIds = new Set<string>();
    const postIdToLinkId = new Map<string, string>();
    if (dropDraftIdList.length > 0) {
      const { data: reviewLinks } = await adminClient
        .from('post_review_links')
        .select('id, post_id')
        .in('post_id', dropDraftIdList);
      const linkIdToPostId = new Map<string, string>();
      for (const r of reviewLinks ?? []) {
        const row = r as { id: string; post_id: string };
        linkIdToPostId.set(row.id, row.post_id);
        // Reuse the first review link we find per post; force-approve only
        // needs a target FK and never surfaces this row to the client.
        if (!postIdToLinkId.has(row.post_id)) {
          postIdToLinkId.set(row.post_id, row.id);
        }
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

    // Drop drafts that still need a synthetic approval comment minted.
    const unapprovedDropDraftIds = Array.from(dropDraftIds).filter(
      (id) => !approvedDropDraftIds.has(id),
    );

    let forceApprovedCount = 0;
    if (unapprovedDropDraftIds.length > 0) {
      const { data: profile } = await adminClient
        .from('users')
        .select('full_name, email')
        .eq('id', user.id)
        .maybeSingle();
      const authorLabel = `${profile?.full_name || profile?.email || 'Admin'} (admin)`;
      const today = new Date().toISOString().slice(0, 10);

      // For drop drafts that have no review link yet, mint one so the
      // synthetic approved-comment FK has a target. 90-day expiry matches
      // the per-post /force-approve route.
      const postsNeedingLink = unapprovedDropDraftIds.filter(
        (id) => !postIdToLinkId.has(id),
      );
      if (postsNeedingLink.length > 0) {
        const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
        const { data: newLinks, error: linkErr } = await adminClient
          .from('post_review_links')
          .insert(
            postsNeedingLink.map((post_id) => ({ post_id, expires_at: expires })),
          )
          .select('id, post_id');
        if (linkErr) {
          console.error('publish-drafts: bulk link insert error:', linkErr);
        } else {
          for (const row of newLinks ?? []) {
            const r = row as { id: string; post_id: string };
            postIdToLinkId.set(r.post_id, r.id);
          }
        }
      }

      const commentRows = unapprovedDropDraftIds
        .map((postId) => postIdToLinkId.get(postId))
        .filter((linkId): linkId is string => !!linkId)
        .map((review_link_id) => ({
          review_link_id,
          author_name: authorLabel,
          content: `Admin force-approve via bulk Set drafts to auto-publish on ${today}.`,
          status: 'approved' as const,
        }));

      if (commentRows.length > 0) {
        const { error: commentErr } = await adminClient
          .from('post_review_comments')
          .insert(commentRows);
        if (commentErr) {
          console.error('publish-drafts: bulk approval comment insert error:', commentErr);
        } else {
          forceApprovedCount = commentRows.length;
        }
      }
    }

    const drafts = allDrafts;
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

        const p = post as typeof post & {
          youtube_title: string | null;
          youtube_description: string | null;
          youtube_tags: string[] | null;
          youtube_privacy: 'public' | 'unlisted' | 'private' | null;
          youtube_made_for_kids: boolean | null;
          tiktok_allow_comment: boolean | null;
          tiktok_allow_duet: boolean | null;
          tiktok_allow_stitch: boolean | null;
          instagram_share_to_feed: boolean | null;
          instagram_content_type: 'feed' | 'reels' | 'story' | null;
          facebook_content_type: 'feed' | 'reel' | 'story' | null;
          facebook_page_id: string | null;
          linkedin_document_title: string | null;
          linkedin_organization_urn: string | null;
          linkedin_disable_link_preview: boolean | null;
          first_comment: string | null;
        };
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
          // Per-platform overrides (migration 218). Null → undefined so
          // buildPublishBody applies its existing defaults.
          youtubeTitle: p.youtube_title ?? undefined,
          youtubeDescription: p.youtube_description ?? undefined,
          youtubeTags: p.youtube_tags ?? undefined,
          youtubePrivacy: p.youtube_privacy ?? undefined,
          youtubeMadeForKids: p.youtube_made_for_kids ?? undefined,
          tiktokAllowComment: p.tiktok_allow_comment ?? undefined,
          tiktokAllowDuet: p.tiktok_allow_duet ?? undefined,
          tiktokAllowStitch: p.tiktok_allow_stitch ?? undefined,
          instagramShareToFeed: p.instagram_share_to_feed ?? undefined,
          // Per-platform routing overrides (migration 255).
          instagramContentType: p.instagram_content_type ?? undefined,
          facebookContentType: p.facebook_content_type ?? undefined,
          facebookPageId: p.facebook_page_id ?? undefined,
          linkedinDocumentTitle: p.linkedin_document_title ?? undefined,
          linkedinOrganizationUrn: p.linkedin_organization_urn ?? undefined,
          linkedinDisableLinkPreview: p.linkedin_disable_link_preview ?? undefined,
          firstComment: p.first_comment ?? undefined,
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
      force_approved: forceApprovedCount,
      message:
        forceApprovedCount > 0
          ? `${postIds.length} draft${postIds.length === 1 ? '' : 's'} set to auto-publish (${forceApprovedCount} force-approved in your name).`
          : `${postIds.length} draft${postIds.length === 1 ? '' : 's'} set to auto-publish.`,
    });
  } catch (error) {
    console.error('POST /api/scheduler/posts/publish-drafts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
