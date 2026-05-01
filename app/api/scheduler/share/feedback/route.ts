import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { getPostingService } from '@/lib/posting';
import type { SocialPlatform } from '@/lib/posting/types';
import { sendRevisionWebhook } from '@/lib/webhooks/revision-webhook';

const FeedbackSchema = z.object({
  share_token: z.string().min(1),
  post_id: z.string().uuid(),
  author_name: z.string().min(1),
  content: z.string().min(1),
  status: z.enum(['approved', 'changes_requested', 'comment']).default('comment'),
});

/**
 * POST /api/scheduler/share/feedback
 *
 * Submit review feedback on a post via a shared calendar link. When a client approves
 * a draft post, it is automatically promoted to 'scheduled' and synced to Late API.
 * Public endpoint — no auth required, authorization is via share token.
 *
 * @auth None (public — share_token provides authorization)
 * @body share_token - Calendar review link token (required)
 * @body post_id - Scheduled post UUID to comment on (required)
 * @body author_name - Commenter name (required)
 * @body content - Feedback text (required)
 * @body status - 'approved' | 'changes_requested' | 'comment' (default 'comment')
 * @returns {{ comment: PostReviewComment }}
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = FeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Verify the share token is valid and active
    const { data: shareLink } = await adminClient
      .from('client_review_links')
      .select('id, client_id, is_active, expires_at')
      .eq('token', parsed.data.share_token)
      .single();

    if (!shareLink || !shareLink.is_active) {
      return NextResponse.json({ error: 'Invalid or deactivated share link' }, { status: 404 });
    }

    if (shareLink.expires_at && new Date(shareLink.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Share link has expired' }, { status: 410 });
    }

    // Verify the post belongs to this client
    const { data: post } = await adminClient
      .from('scheduled_posts')
      .select('id, client_id')
      .eq('id', parsed.data.post_id)
      .eq('client_id', shareLink.client_id)
      .single();

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Get or create a per-post review link (needed for the comments table FK)
    let reviewLinkId: string;
    const { data: existingLink } = await adminClient
      .from('post_review_links')
      .select('id')
      .eq('post_id', parsed.data.post_id)
      .limit(1)
      .maybeSingle();

    if (existingLink) {
      reviewLinkId = existingLink.id;
    } else {
      const { data: newLink, error: linkError } = await adminClient
        .from('post_review_links')
        .insert({ post_id: parsed.data.post_id })
        .select('id')
        .single();

      if (linkError || !newLink) {
        console.error('Create review link error:', linkError);
        return NextResponse.json({ error: 'Failed to create review link' }, { status: 500 });
      }
      reviewLinkId = newLink.id;
    }

    // Insert the comment
    const { data: comment, error: commentError } = await adminClient
      .from('post_review_comments')
      .insert({
        review_link_id: reviewLinkId,
        author_name: parsed.data.author_name,
        content: parsed.data.content,
        status: parsed.data.status,
      })
      .select()
      .single();

    if (commentError || !comment) {
      console.error('Create comment error:', commentError);
      return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 });
    }

    // Fire revision webhook if configured for this client
    try {
      const { data: clientRow } = await adminClient
        .from('clients')
        .select('name, revision_webhook_url')
        .eq('id', shareLink.client_id)
        .single();

      if (clientRow?.revision_webhook_url) {
        // Get the post caption for context
        const { data: postForWebhook } = await adminClient
          .from('scheduled_posts')
          .select('caption')
          .eq('id', parsed.data.post_id)
          .single();

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
        void sendRevisionWebhook(clientRow.revision_webhook_url, {
          clientName: clientRow.name,
          postCaption: postForWebhook?.caption ?? 'No caption',
          reviewerName: parsed.data.author_name,
          comment: parsed.data.content,
          status: parsed.data.status,
          postUrl: `${appUrl}/shared/calendar/${parsed.data.share_token}`,
        });
      }
    } catch (webhookErr) {
      // Non-blocking — don't fail the feedback submission
      console.error('[revision-webhook] Error dispatching:', webhookErr);
    }

    // When client approves a draft post, promote it to scheduled and sync to Late
    if (parsed.data.status === 'approved') {
      // Pull per-platform overrides (migration 218) so YouTube titles,
      // TikTok interaction settings, etc. survive client approval.
      const { data: postRow } = await adminClient
        .from('scheduled_posts')
        .select('id, status, caption, hashtags, scheduled_at, cover_image_url, tagged_people, collaborator_handles, youtube_title, youtube_description, youtube_tags, youtube_privacy, youtube_made_for_kids, tiktok_allow_comment, tiktok_allow_duet, tiktok_allow_stitch, instagram_share_to_feed')
        .eq('id', parsed.data.post_id)
        .single();

      if (postRow && postRow.status === 'draft') {
        await adminClient
          .from('scheduled_posts')
          .update({ status: 'scheduled', updated_at: new Date().toISOString() })
          .eq('id', postRow.id);

        // Sync to Late API
        try {
          const { data: platformLinks } = await adminClient
            .from('scheduled_post_platforms')
            .select('social_profile_id, social_profiles(id, platform, late_account_id)')
            .eq('post_id', postRow.id);

          const lateProfiles = (platformLinks ?? [])
            .map((pl: Record<string, unknown>) => pl.social_profiles as { id: string; platform: string; late_account_id: string | null } | null)
            .filter((p): p is { id: string; platform: string; late_account_id: string } => !!p?.late_account_id);

          if (lateProfiles.length > 0) {
            const { data: mediaRows } = await adminClient
              .from('scheduled_post_media')
              .select('scheduler_media(late_media_url)')
              .eq('post_id', postRow.id)
              .limit(1);

            const mediaUrl = ((mediaRows?.[0] as Record<string, unknown>)?.scheduler_media as Record<string, unknown> | null)?.late_media_url as string ?? '';

            const service = getPostingService();
            const pr = postRow as typeof postRow & {
              youtube_title: string | null;
              youtube_description: string | null;
              youtube_tags: string[] | null;
              youtube_privacy: 'public' | 'unlisted' | 'private' | null;
              youtube_made_for_kids: boolean | null;
              tiktok_allow_comment: boolean | null;
              tiktok_allow_duet: boolean | null;
              tiktok_allow_stitch: boolean | null;
              instagram_share_to_feed: boolean | null;
            };
            const lateResult = await service.publishPost({
              videoUrl: mediaUrl,
              caption: postRow.caption ?? '',
              hashtags: postRow.hashtags ?? [],
              platformProfileIds: lateProfiles.map(p => p.late_account_id),
              platformHints: Object.fromEntries(
                lateProfiles.map(p => [p.late_account_id, p.platform as SocialPlatform])
              ),
              scheduledAt: postRow.scheduled_at ?? undefined,
              coverImageUrl: postRow.cover_image_url ?? undefined,
              taggedPeople: postRow.tagged_people ?? [],
              collaboratorHandles: postRow.collaborator_handles ?? [],
              // Per-platform overrides (migration 218). Null → undefined so
              // buildPublishBody applies its existing defaults.
              youtubeTitle: pr.youtube_title ?? undefined,
              youtubeDescription: pr.youtube_description ?? undefined,
              youtubeTags: pr.youtube_tags ?? undefined,
              youtubePrivacy: pr.youtube_privacy ?? undefined,
              youtubeMadeForKids: pr.youtube_made_for_kids ?? undefined,
              tiktokAllowComment: pr.tiktok_allow_comment ?? undefined,
              tiktokAllowDuet: pr.tiktok_allow_duet ?? undefined,
              tiktokAllowStitch: pr.tiktok_allow_stitch ?? undefined,
              instagramShareToFeed: pr.instagram_share_to_feed ?? undefined,
            });

            await adminClient
              .from('scheduled_posts')
              .update({ late_post_id: lateResult.externalPostId })
              .eq('id', postRow.id);
          }
        } catch (lateErr) {
          console.error('Late API sync after approval error:', lateErr);
        }
      }
    }

    return NextResponse.json({ comment });
  } catch (error) {
    console.error('POST /api/scheduler/share/feedback error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
