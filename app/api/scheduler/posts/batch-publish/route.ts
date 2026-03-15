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

    // Set all selected posts to 'publishing' status with scheduled_at = now
    const { data: updated, error } = await adminClient
      .from('scheduled_posts')
      .update({
        status: 'publishing',
        scheduled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', parsed.data.post_ids)
      .in('status', ['scheduled', 'draft'])
      .select('id');

    if (error) {
      console.error('Batch publish error:', error);
      return NextResponse.json({ error: 'Failed to trigger publish' }, { status: 500 });
    }

    // The cron job will pick these up on next run
    return NextResponse.json({
      published: updated?.length ?? 0,
      message: `${updated?.length ?? 0} posts queued for publishing`,
    });
  } catch (error) {
    console.error('POST /api/scheduler/posts/batch-publish error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
