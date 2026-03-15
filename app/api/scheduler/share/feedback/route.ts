import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { getPostingService } from '@/lib/posting';
import type { SocialPlatform } from '@/lib/posting/types';

const FeedbackSchema = z.object({
  share_token: z.string().min(1),
  post_id: z.string().uuid(),
  author_name: z.string().min(1),
  content: z.string().min(1),
  status: z.enum(['approved', 'changes_requested', 'comment']).default('comment'),
});

/** POST: Submit feedback on a post via a shared calendar link (public — no auth) */
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

    // When client approves a draft post, promote it to scheduled and sync to Late
    if (parsed.data.status === 'approved') {
      const { data: postRow } = await adminClient
        .from('scheduled_posts')
        .select('id, status, caption, hashtags, scheduled_at, cover_image_url, tagged_people, collaborator_handles')
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
