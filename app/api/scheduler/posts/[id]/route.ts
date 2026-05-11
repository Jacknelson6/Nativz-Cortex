import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { z } from 'zod';
import { getPostingService } from '@/lib/posting';

/**
 * Resolve the client_id a scheduled post belongs to and assert that the
 * given user is allowed to mutate it. Admins skip the access check;
 * viewers must have a row in `user_client_access` for the owning brand.
 *
 * Returns `{ ok: true }` when the user is allowed, or a NextResponse
 * with the appropriate 403/404 to bail out with.
 */
async function assertPostAccess(
  postId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const admin = createAdminClient();
  const { data: post } = await admin
    .from('scheduled_posts')
    .select('client_id')
    .eq('id', postId)
    .maybeSingle();

  if (!post) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not found' }, { status: 404 }),
    };
  }

  if (await isAdmin(userId)) return { ok: true };

  const { data: access } = await admin
    .from('user_client_access')
    .select('client_id')
    .eq('user_id', userId)
    .eq('client_id', post.client_id)
    .maybeSingle();

  if (!access) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { ok: true };
}

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
  // Per-platform overrides (migrations 218 + 255). All nullable so the UI
  // can clear an override (NULL → fall back to router default).
  youtube_title: z.string().nullable().optional(),
  youtube_description: z.string().nullable().optional(),
  youtube_tags: z.array(z.string()).nullable().optional(),
  youtube_privacy: z.enum(['public', 'unlisted', 'private']).nullable().optional(),
  youtube_made_for_kids: z.boolean().nullable().optional(),
  tiktok_allow_comment: z.boolean().nullable().optional(),
  tiktok_allow_duet: z.boolean().nullable().optional(),
  tiktok_allow_stitch: z.boolean().nullable().optional(),
  instagram_share_to_feed: z.boolean().nullable().optional(),
  instagram_content_type: z.enum(['feed', 'reels', 'story']).nullable().optional(),
  facebook_content_type: z.enum(['feed', 'reel', 'story']).nullable().optional(),
  facebook_page_id: z.string().nullable().optional(),
  linkedin_document_title: z.string().nullable().optional(),
  linkedin_organization_urn: z.string().nullable().optional(),
  linkedin_disable_link_preview: z.boolean().nullable().optional(),
  first_comment: z.string().nullable().optional(),
});

/**
 * PUT /api/scheduler/posts/[id]
 *
 * Update a scheduled post's fields, platform links, and/or media attachments.
 * When media is replaced, old media items are unmarked as used. Platform links
 * are diffed against the existing legs when `platform_profile_ids` is provided:
 * profiles that stay selected keep their per-leg state (status, external_post_id,
 * failure_reason), newly added profiles get a fresh `pending` row, deselected
 * profiles are removed. Already-published legs are never silently dropped.
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

    const access = await assertPostAccess(id, user.id);
    if (!access.ok) return access.response;

    const body = await request.json();
    const parsed = UpdatePostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const data = parsed.data;

    const adminClient = createAdminClient();

    // APPROVAL GATE — defense in depth.
    //
    // If this PUT flips status from 'draft' to 'scheduled', and the row is
    // a drop-derived post (linked from `content_drop_videos`), it MUST
    // already have an approved `post_review_comments` row. The cron
    // (`/api/cron/publish-posts`) refuses to publish unapproved drop rows,
    // but the calendar UI shouldn't even let a row go "scheduled" without
    // approval — it creates the false impression that the post will ship.
    // Same gate as `publish-drafts` and `batch-publish`; this is the third
    // entry point that can flip drop drafts toward publishing.
    if (data.status === 'scheduled') {
      const { data: dropVideo } = await adminClient
        .from('content_drop_videos')
        .select('scheduled_post_id')
        .eq('scheduled_post_id', id)
        .maybeSingle();

      if (dropVideo) {
        const { data: reviewLinks } = await adminClient
          .from('post_review_links')
          .select('id')
          .eq('post_id', id);

        const linkIds = (reviewLinks ?? []).map(
          (r) => (r as { id: string }).id,
        );
        let hasApproval = false;
        if (linkIds.length > 0) {
          const { data: approvedComments } = await adminClient
            .from('post_review_comments')
            .select('id')
            .in('review_link_id', linkIds)
            .eq('status', 'approved')
            .limit(1);
          hasApproval = (approvedComments?.length ?? 0) > 0;
        }

        if (!hasApproval) {
          return NextResponse.json(
            {
              error:
                'This post is part of a content drop and needs an approval comment before it can be scheduled.',
            },
            { status: 422 },
          );
        }
      }
    }

    // Build update object with only provided fields
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.caption !== undefined) updates.caption = data.caption;
    if (data.hashtags !== undefined) updates.hashtags = data.hashtags;
    if (data.scheduled_at !== undefined) updates.scheduled_at = data.scheduled_at;
    if (data.status !== undefined) updates.status = data.status;
    if (data.cover_image_url !== undefined) updates.cover_image_url = data.cover_image_url;
    if (data.tagged_people !== undefined) updates.tagged_people = data.tagged_people;
    if (data.collaborator_handles !== undefined) updates.collaborator_handles = data.collaborator_handles;
    // Per-platform overrides — `undefined` means "don't touch", explicit
    // `null` clears the override back to the router default.
    if (data.youtube_title !== undefined) updates.youtube_title = data.youtube_title;
    if (data.youtube_description !== undefined) updates.youtube_description = data.youtube_description;
    if (data.youtube_tags !== undefined) updates.youtube_tags = data.youtube_tags;
    if (data.youtube_privacy !== undefined) updates.youtube_privacy = data.youtube_privacy;
    if (data.youtube_made_for_kids !== undefined) updates.youtube_made_for_kids = data.youtube_made_for_kids;
    if (data.tiktok_allow_comment !== undefined) updates.tiktok_allow_comment = data.tiktok_allow_comment;
    if (data.tiktok_allow_duet !== undefined) updates.tiktok_allow_duet = data.tiktok_allow_duet;
    if (data.tiktok_allow_stitch !== undefined) updates.tiktok_allow_stitch = data.tiktok_allow_stitch;
    if (data.instagram_share_to_feed !== undefined) updates.instagram_share_to_feed = data.instagram_share_to_feed;
    if (data.instagram_content_type !== undefined) updates.instagram_content_type = data.instagram_content_type;
    if (data.facebook_content_type !== undefined) updates.facebook_content_type = data.facebook_content_type;
    if (data.facebook_page_id !== undefined) updates.facebook_page_id = data.facebook_page_id;
    if (data.linkedin_document_title !== undefined) updates.linkedin_document_title = data.linkedin_document_title;
    if (data.linkedin_organization_urn !== undefined) updates.linkedin_organization_urn = data.linkedin_organization_urn;
    if (data.linkedin_disable_link_preview !== undefined) updates.linkedin_disable_link_preview = data.linkedin_disable_link_preview;
    if (data.first_comment !== undefined) updates.first_comment = data.first_comment;

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

    // Sync rescheduled time to Zernio. Without this, dragging in our calendar
    // would update our DB but Zernio would still publish at the original
    // `scheduledFor`, producing a silent drift between our UI and the actual
    // queue. Failures are logged + surfaced via `zernio_sync_warning` rather
    // than rolling back — our row is authoritative, and the cron + status
    // poller will reconcile on the next pass.
    let zernioSyncWarning: string | null = null;
    if (
      data.scheduled_at !== undefined &&
      data.scheduled_at !== null &&
      (post as { late_post_id?: string | null }).late_post_id
    ) {
      try {
        const service = getPostingService();
        await service.reschedulePost(
          (post as { late_post_id: string }).late_post_id,
          data.scheduled_at,
        );
      } catch (zernioErr) {
        console.error('Failed to reschedule on Zernio:', zernioErr);
        zernioSyncWarning =
          zernioErr instanceof Error
            ? zernioErr.message
            : 'Zernio reschedule failed';
      }
    }

    // Update platform links if provided.
    //
    // This is a per-leg toggle: each connected social profile that the
    // user keeps selected stays as-is (preserving its `status`,
    // `external_post_id`, `failure_reason` — i.e. whatever the
    // publisher already wrote), each profile newly added gets a fresh
    // `pending` row, each profile newly deselected gets removed.
    //
    // We deliberately AVOID the old "delete all + reinsert" path here.
    // For a partially-published post, dropping the row would erase the
    // success record on the legs that did go out — losing the
    // `external_post_id` we use to render "View on platform" links and
    // the publish results panel.
    //
    // Already-published legs are protected by an additional safety
    // check: we never delete a leg whose status is anything other than
    // pending/scheduled/failed. If the editor somehow lands here with a
    // published leg deselected, we keep it — the editor's published
    // lock + disabled save should already prevent this case.
    if (data.platform_profile_ids !== undefined) {
      const desired = new Set(data.platform_profile_ids);

      const { data: existingLegs } = await adminClient
        .from('scheduled_post_platforms')
        .select('id, social_profile_id, status')
        .eq('post_id', id);
      const existing = (existingLegs ?? []) as Array<{
        id: string;
        social_profile_id: string;
        status: string;
      }>;

      const existingProfileIds = new Set(existing.map(l => l.social_profile_id));

      const toDelete = existing.filter(
        l =>
          !desired.has(l.social_profile_id) &&
          // Hard guard — never silently drop a leg the publisher has
          // already touched. 'pending' / 'scheduled' / 'failed' are the
          // safe-to-drop states; 'published' / 'publishing' /
          // 'partially_failed' stay regardless of UI selection.
          (l.status === 'pending' || l.status === 'scheduled' || l.status === 'failed'),
      );
      const toInsert = data.platform_profile_ids.filter(
        pid => !existingProfileIds.has(pid),
      );

      if (toDelete.length > 0) {
        await adminClient
          .from('scheduled_post_platforms')
          .delete()
          .in('id', toDelete.map(l => l.id));
      }
      if (toInsert.length > 0) {
        await adminClient.from('scheduled_post_platforms').insert(
          toInsert.map(profileId => ({
            post_id: id,
            social_profile_id: profileId,
            status: 'pending',
          })),
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

    return NextResponse.json(
      zernioSyncWarning ? { post, zernio_sync_warning: zernioSyncWarning } : { post },
    );
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

    // Delete is admin-only — viewers don't see the trash button in the
    // UI and shouldn't be able to wipe a post via direct API call.
    if (!(await isAdmin(user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
