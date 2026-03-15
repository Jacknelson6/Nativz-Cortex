import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const CommentSchema = z.object({
  review_link_id: z.string().uuid(),
  author_name: z.string().min(1).default('Anonymous'),
  content: z.string().min(1),
  status: z.enum(['approved', 'changes_requested', 'comment']).default('comment'),
});

/**
 * POST /api/scheduler/review/comment
 *
 * Add a review comment to a post review link. Public endpoint — clients use this to
 * approve, request changes, or leave a general comment without needing an account.
 * Returns 410 if the review link has expired.
 *
 * @auth None (public — review_link_id provides authorization)
 * @body review_link_id - Post review link UUID (required)
 * @body author_name - Commenter name (default 'Anonymous')
 * @body content - Comment text (required)
 * @body status - 'approved' | 'changes_requested' | 'comment' (default 'comment')
 * @returns {{ comment: PostReviewComment }}
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CommentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Verify review link exists and isn't expired
    const { data: link } = await adminClient
      .from('post_review_links')
      .select('id, expires_at')
      .eq('id', parsed.data.review_link_id)
      .single();

    if (!link) {
      return NextResponse.json({ error: 'Invalid review link' }, { status: 404 });
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Review link has expired' }, { status: 410 });
    }

    const { data: comment, error } = await adminClient
      .from('post_review_comments')
      .insert({
        review_link_id: parsed.data.review_link_id,
        author_name: parsed.data.author_name,
        content: parsed.data.content,
        status: parsed.data.status,
      })
      .select()
      .single();

    if (error || !comment) {
      console.error('Create comment error:', error);
      return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
    }

    return NextResponse.json({ comment });
  } catch (error) {
    console.error('POST /api/scheduler/review/comment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
