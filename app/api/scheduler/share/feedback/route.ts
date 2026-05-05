import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { publishScheduledPost } from '@/lib/calendar/schedule-drop';
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
          postUrl: `${appUrl}/s/${parsed.data.share_token}`,
        });
      }
    } catch (webhookErr) {
      // Non-blocking — don't fail the feedback submission
      console.error('[revision-webhook] Error dispatching:', webhookErr);
    }

    // When the client approves a draft post, hand it off to the shared
    // `publishScheduledPost` helper. That gives us the atomic CAS (closes the
    // race between two simultaneous approvals firing duplicate Zernio
    // tickets), Mux-aware media resolution (ships revised cuts instead of the
    // stale snapshot — the May 4 Weston Funding bug), and per-platform spp
    // status backfill. Inline `service.publishPost` here used to do none of
    // those things; the consolidation also removes ~80 lines of drift between
    // the two share-feedback paths (calendar + legacy SMM scheduler).
    if (parsed.data.status === 'approved') {
      try {
        await publishScheduledPost(adminClient, parsed.data.post_id);
      } catch (publishErr) {
        console.error('Approval publish error:', publishErr);
      }
    }

    return NextResponse.json({ comment });
  } catch (error) {
    console.error('POST /api/scheduler/share/feedback error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
