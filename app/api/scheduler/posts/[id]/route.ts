import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { getPostingService } from '@/lib/posting';

const UpdatePostSchema = z.object({
  caption: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  scheduled_at: z.string().nullable().optional(),
  status: z.enum(['draft', 'scheduled']).optional(),
  platform_profile_ids: z.array(z.string()).optional(),
  media_ids: z.array(z.string()).optional(),
  cover_image_url: z.string().nullable().optional(),
  tagged_people: z.array(z.string()).optional(),
  collaborator_handles: z.array(z.string()).optional(),
});

/**
 * PUT /api/scheduler/posts/[id]
 *
 * Update a scheduled post's fields, platform links, and/or media attachments.
 * When media is replaced, old media items are unmarked as used. Platform links
 * are replaced atomically (delete then insert) if platform_profile_ids is provided.
 *
 * @auth Required (any authenticated user)
 * @param id - Scheduled post UUID
 * @body caption - Updated caption (optional)
 * @body hashtags - Updated hashtags array (optional)
 * @body scheduled_at - Updated schedule datetime or null (optional)
 * @body status - 'draft' | 'scheduled' (optional)
 * @body platform_profile_ids - Replace platform profile links (optional)
 * @body media_ids - Replace media attachments (optional)
 * @body cover_image_url - Updated cover image URL (optional)
 * @body tagged_people - Updated tagged people (optional)
 * @body collaborator_handles - Updated collaborator handles (optional)
 * @returns {{ post: ScheduledPost }}
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = UpdatePostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const data = parsed.data;

    const adminClient = createAdminClient();

    // Build update object with only provided fields
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.caption !== undefined) updates.caption = data.caption;
    if (data.hashtags !== undefined) updates.hashtags = data.hashtags;
    if (data.scheduled_at !== undefined) updates.scheduled_at = data.scheduled_at;
    if (data.status !== undefined) updates.status = data.status;
    if (data.cover_image_url !== undefined) updates.cover_image_url = data.cover_image_url;
    if (data.tagged_people !== undefined) updates.tagged_people = data.tagged_people;
    if (data.collaborator_handles !== undefined) updates.collaborator_handles = data.collaborator_handles;

    const { data: post, error: updateError } = await adminClient
      .from('scheduled_posts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError || !post) {
      console.error('Update post error:', updateError);
      return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
    }

    // Update platform links if provided
    if (data.platform_profile_ids !== undefined) {
      await adminClient.from('scheduled_post_platforms').delete().eq('post_id', id);
      if (data.platform_profile_ids.length > 0) {
        await adminClient.from('scheduled_post_platforms').insert(
          data.platform_profile_ids.map(profileId => ({
            post_id: id,
            social_profile_id: profileId,
            status: 'pending',
          }))
        );
      }
    }

    // Update media links if provided
    if (data.media_ids !== undefined) {
      // Get old media to unmark as used
      const { data: oldMedia } = await adminClient
        .from('scheduled_post_media')
        .select('media_id')
        .eq('post_id', id);

      await adminClient.from('scheduled_post_media').delete().eq('post_id', id);

      if (oldMedia?.length) {
        await adminClient
          .from('scheduler_media')
          .update({ is_used: false })
          .in('id', oldMedia.map(m => m.media_id));
      }

      if (data.media_ids.length > 0) {
        await adminClient.from('scheduled_post_media').insert(
          data.media_ids.map((mediaId, i) => ({
            post_id: id,
            media_id: mediaId,
            sort_order: i,
          }))
        );
        await adminClient
          .from('scheduler_media')
          .update({ is_used: true })
          .in('id', data.media_ids);
      }
    }

    return NextResponse.json({ post });
  } catch (error) {
    console.error('PUT /api/scheduler/posts/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/scheduler/posts/[id]
 *
 * Delete a scheduled post. Attempts to remove the post from Late API first if a
 * late_post_id exists (non-fatal on failure), unmarks attached media as used, then
 * deletes the post record (cascades to platforms, media links, and review links).
 *
 * @auth Required (any authenticated user)
 * @param id - Scheduled post UUID
 * @returns {{ success: true }}
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Delete from Late first
    const { data: postToDelete } = await adminClient
      .from('scheduled_posts')
      .select('late_post_id')
      .eq('id', id)
      .single();

    if (postToDelete?.late_post_id) {
      try {
        const service = getPostingService();
        await service.deletePost(postToDelete.late_post_id);
      } catch (lateErr) {
        console.error('Failed to delete from Late:', lateErr);
        // Continue with local delete even if Late fails
      }
    }

    // Unmark media as used
    const { data: postMedia } = await adminClient
      .from('scheduled_post_media')
      .select('media_id')
      .eq('post_id', id);

    if (postMedia?.length) {
      await adminClient
        .from('scheduler_media')
        .update({ is_used: false })
        .in('id', postMedia.map(m => m.media_id));
    }

    // Delete post (cascades to platforms, media links, review links)
    const { error } = await adminClient
      .from('scheduled_posts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete post error:', error);
      return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/scheduler/posts/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
