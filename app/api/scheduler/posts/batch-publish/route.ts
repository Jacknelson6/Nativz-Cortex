import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const BatchPublishSchema = z.object({
  post_ids: z.array(z.string().uuid()).min(1),
});

/**
 * POST /api/scheduler/posts/batch-publish
 *
 * Queue multiple scheduled or draft posts for immediate publishing by setting their
 * status to 'publishing' and scheduled_at to now. The cron job picks them up on
 * its next run.
 *
 * @auth Required (any authenticated user)
 * @body post_ids - Array of scheduled post UUIDs to publish (min 1 required)
 * @returns {{ published: number, message: string }}
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = BatchPublishSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // APPROVAL GATE — defense in depth.
    //
    // Drop-derived posts (rows linked from `content_drop_videos`) MUST have
    // an approved `post_review_comments` row before we ship them. The
    // publish cron (`/api/cron/publish-posts`) and `publish-drafts` already
    // enforce this; this route is the third potential entry point that
    // flips drop drafts toward publishing, so it needs the same gate.
    // Without it, an admin could batch-publish a set of UUIDs that includes
    // an unapproved drop post and rely solely on the cron's approval gate
    // to catch it (which it does — but as failure rather than silent skip,
    // which is bad UX). Filter unapproved drop posts out here instead.
    const candidateIds = parsed.data.post_ids;
    const { data: dropVideoRows } = await adminClient
      .from('content_drop_videos')
      .select('scheduled_post_id')
      .in('scheduled_post_id', candidateIds);
    const dropIds = new Set(
      (dropVideoRows ?? []).map(
        (r) => (r as { scheduled_post_id: string }).scheduled_post_id,
      ),
    );

    let approvedDropIds = new Set<string>();
    if (dropIds.size > 0) {
      const { data: reviewLinks } = await adminClient
        .from('post_review_links')
        .select('id, post_id')
        .in('post_id', Array.from(dropIds));
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
        approvedDropIds = new Set(
          (approvedComments ?? [])
            .map((c) =>
              linkIdToPostId.get(
                (c as { review_link_id: string }).review_link_id,
              ),
            )
            .filter((id): id is string => !!id),
        );
      }
    }

    const eligibleIds = candidateIds.filter((id) => {
      if (!dropIds.has(id)) return true;
      return approvedDropIds.has(id);
    });
    const skippedUnapprovedCount = candidateIds.length - eligibleIds.length;

    if (eligibleIds.length === 0) {
      return NextResponse.json({
        published: 0,
        skipped_unapproved: skippedUnapprovedCount,
        message:
          skippedUnapprovedCount > 0
            ? `${skippedUnapprovedCount} drop post${skippedUnapprovedCount === 1 ? '' : 's'} skipped (no approval comment).`
            : 'No eligible posts to publish',
      });
    }

    // Set all eligible posts to 'publishing' status with scheduled_at = now
    const { data: updated, error } = await adminClient
      .from('scheduled_posts')
      .update({
        status: 'publishing',
        scheduled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', eligibleIds)
      .in('status', ['scheduled', 'draft'])
      .select('id');

    if (error) {
      console.error('Batch publish error:', error);
      return NextResponse.json({ error: 'Failed to trigger publish' }, { status: 500 });
    }

    // The cron job will pick these up on next run
    return NextResponse.json({
      published: updated?.length ?? 0,
      skipped_unapproved: skippedUnapprovedCount,
      message:
        skippedUnapprovedCount > 0
          ? `${updated?.length ?? 0} posts queued; ${skippedUnapprovedCount} drop post${skippedUnapprovedCount === 1 ? '' : 's'} skipped (no approval comment).`
          : `${updated?.length ?? 0} posts queued for publishing`,
    });
  } catch (error) {
    console.error('POST /api/scheduler/posts/batch-publish error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
