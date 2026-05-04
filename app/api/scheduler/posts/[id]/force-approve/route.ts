import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

/**
 * POST /api/scheduler/posts/[id]/force-approve
 *
 * Admin-only escape hatch: bypass the drop-post approval gate by minting a
 * synthetic review link + an approved review comment in the admin's name,
 * then flipping the post from `draft` to `scheduled`. Cron picks it up on
 * the next tick. Use this when a post needs to ship without going through
 * the share-link review flow (e.g. backfilled drafts, internal posts).
 *
 * @auth Admin only
 * @param id - Scheduled post UUID
 * @returns {{ post: ScheduledPost, message: string }}
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await isAdmin(user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const adminClient = createAdminClient();

    const { data: post, error: postError } = await adminClient
      .from('scheduled_posts')
      .select('id, status, scheduled_at')
      .eq('id', id)
      .maybeSingle();

    if (postError || !post) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (post.status !== 'draft') {
      return NextResponse.json(
        { error: `Cannot force-publish a post in status '${post.status}'. Only drafts are eligible.` },
        { status: 422 },
      );
    }

    const { data: profile } = await adminClient
      .from('users')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle();

    const authorLabel = `${profile?.full_name || profile?.email || 'Admin'} (admin)`;

    // Mint a synthetic review link so the approved-comment FK has a target.
    // 90-day expiry is arbitrary, the row is never surfaced to anyone.
    const { data: link, error: linkError } = await adminClient
      .from('post_review_links')
      .insert({
        post_id: id,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();

    if (linkError || !link) {
      console.error('force-approve: link insert error:', linkError);
      return NextResponse.json({ error: 'Failed to mint review link' }, { status: 500 });
    }

    const { error: commentError } = await adminClient
      .from('post_review_comments')
      .insert({
        review_link_id: link.id,
        author_name: authorLabel,
        content: `Admin force-approve via API on ${new Date().toISOString().slice(0, 10)}.`,
        status: 'approved',
      });

    if (commentError) {
      console.error('force-approve: comment insert error:', commentError);
      return NextResponse.json({ error: 'Failed to record approval' }, { status: 500 });
    }

    const { data: updated, error: updateError } = await adminClient
      .from('scheduled_posts')
      .update({
        status: 'scheduled',
        failure_reason: null,
        retry_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('force-approve: status flip error:', updateError);
      return NextResponse.json({ error: 'Failed to update post status' }, { status: 500 });
    }

    return NextResponse.json({
      post: updated,
      message: 'Approval bypassed. Post will publish on its scheduled time.',
    });
  } catch (error) {
    console.error('POST /api/scheduler/posts/[id]/force-approve error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
