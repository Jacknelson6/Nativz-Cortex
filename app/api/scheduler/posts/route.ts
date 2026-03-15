import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { getPostingService } from '@/lib/posting';
import type { SocialPlatform } from '@/lib/posting/types';

const CreatePostSchema = z.object({
  client_id: z.string().uuid(),
  caption: z.string().default(''),
  hashtags: z.array(z.string()).default([]),
  scheduled_at: z.string().nullable().default(null),
  status: z.enum(['draft', 'scheduled']).default('draft'),
  platform_profile_ids: z.array(z.string()).default([]),
  media_ids: z.array(z.string()).default([]),
  cover_image_url: z.string().nullable().default(null),
  tagged_people: z.array(z.string()).default([]),
  collaborator_handles: z.array(z.string()).default([]),
});

/**
 * POST /api/scheduler/posts
 *
 * Create a new scheduled post. Persists the post, links platform profiles and media,
 * then syncs to the Late API if any linked profiles have a late_account_id and the
 * status is 'scheduled' (not 'draft'). Late sync failures are logged but non-fatal.
 *
 * @auth Required (any authenticated user)
 * @body client_id - Client UUID (required)
 * @body caption - Post caption text (default '')
 * @body hashtags - Array of hashtags (default [])
 * @body scheduled_at - ISO datetime for scheduling, or null for drafts
 * @body status - 'draft' | 'scheduled' (default 'draft')
 * @body platform_profile_ids - Social profile UUIDs to publish to
 * @body media_ids - Scheduler media UUIDs to attach
 * @body cover_image_url - Cover image URL for video posts (nullable)
 * @body tagged_people - Instagram tagged people handles
 * @body collaborator_handles - Instagram collaborator handles
 * @returns {{ post: ScheduledPost }}
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = CreatePostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const data = parsed.data;

    const adminClient = createAdminClient();

    // Create the post
    const { data: post, error: postError } = await adminClient
      .from('scheduled_posts')
      .insert({
        client_id: data.client_id,
        created_by: user.id,
        caption: data.caption,
        hashtags: data.hashtags,
        scheduled_at: data.scheduled_at,
        status: data.status,
        cover_image_url: data.cover_image_url,
        tagged_people: data.tagged_people,
        collaborator_handles: data.collaborator_handles,
      })
      .select()
      .single();

    if (postError || !post) {
      console.error('Create post error:', postError);
      return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
    }

    // Link platform profiles
    if (data.platform_profile_ids.length > 0) {
      const { error: platformError } = await adminClient
        .from('scheduled_post_platforms')
        .insert(
          data.platform_profile_ids.map(profileId => ({
            post_id: post.id,
            social_profile_id: profileId,
            status: 'pending',
          }))
        );
      if (platformError) {
        console.error('Link platforms error:', platformError);
      }
    }

    // Link media
    if (data.media_ids.length > 0) {
      const { error: mediaError } = await adminClient
        .from('scheduled_post_media')
        .insert(
          data.media_ids.map((mediaId, i) => ({
            post_id: post.id,
            media_id: mediaId,
            sort_order: i,
          }))
        );
      if (mediaError) {
        console.error('Link media error:', mediaError);
      }

      // Mark media as used
      await adminClient
        .from('scheduler_media')
        .update({ is_used: true })
        .in('id', data.media_ids);
    }

    // Sync to Late API only for scheduled posts (not drafts)
    if (data.status === 'scheduled') try {
      const { data: profileRows } = await adminClient
        .from('social_profiles')
        .select('id, platform, late_account_id')
        .in('id', data.platform_profile_ids);

      const lateProfiles = (profileRows ?? []).filter(p => p.late_account_id);

      if (lateProfiles.length > 0) {
        // Get media URLs from linked scheduler_media
        const { data: mediaRows } = await adminClient
          .from('scheduler_media')
          .select('late_media_url')
          .in('id', data.media_ids);

        const mediaUrl = mediaRows?.[0]?.late_media_url ?? '';

        const service = getPostingService();
        const lateResult = await service.publishPost({
          videoUrl: mediaUrl,
          caption: data.caption,
          hashtags: data.hashtags,
          platformProfileIds: lateProfiles.map(p => p.late_account_id!),
          platformHints: Object.fromEntries(
            lateProfiles.map(p => [p.late_account_id!, p.platform as SocialPlatform])
          ),
          scheduledAt: data.scheduled_at ?? undefined,
          coverImageUrl: data.cover_image_url ?? undefined,
          taggedPeople: data.tagged_people,
          collaboratorHandles: data.collaborator_handles,
        });

        // Save Late post ID back to our record
        await adminClient
          .from('scheduled_posts')
          .update({ late_post_id: lateResult.externalPostId })
          .eq('id', post.id);
      }
    } catch (lateErr) {
      // Log but don't fail — local record is saved, Late sync can be retried
      console.error('Late API sync error:', lateErr);
    }

    return NextResponse.json({ post });
  } catch (error) {
    console.error('POST /api/scheduler/posts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/scheduler/posts
 *
 * List scheduled posts for a client, with associated platforms, media, and review
 * link status. Returns posts ordered by scheduled_at ascending.
 *
 * @auth Required (any authenticated user)
 * @query client_id - Client UUID to filter by (required)
 * @query start - Filter posts on or after this datetime (optional)
 * @query end - Filter posts on or before this datetime (optional)
 * @returns {{ posts: TransformedScheduledPost[] }}
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    let query = adminClient
      .from('scheduled_posts')
      .select(`
        *,
        scheduled_post_platforms (
          id,
          social_profile_id,
          status,
          external_post_id,
          external_post_url,
          failure_reason,
          social_profiles (
            id,
            platform,
            username,
            avatar_url
          )
        ),
        scheduled_post_media (
          id,
          media_id,
          sort_order,
          scheduler_media (
            id,
            filename,
            storage_path,
            thumbnail_url,
            late_media_url,
            mime_type
          )
        ),
        post_review_links (
          id,
          token,
          expires_at
        )
      `)
      .eq('client_id', clientId)
      .order('scheduled_at', { ascending: true, nullsFirst: false });

    if (start) query = query.gte('scheduled_at', start);
    if (end) query = query.lte('scheduled_at', end);

    const { data: posts, error } = await query;

    if (error) {
      console.error('List posts error:', error);
      return NextResponse.json({ error: 'Failed to load posts' }, { status: 500 });
    }

    // Transform for the frontend
    const transformed = (posts ?? []).map(post => {
      const platforms = (post.scheduled_post_platforms ?? []).map((spp: Record<string, unknown>) => {
        const profile = spp.social_profiles as Record<string, unknown> | null;
        return {
          platform: profile?.platform ?? '',
          profile_id: spp.social_profile_id,
          username: profile?.username ?? '',
          status: spp.status,
          external_post_url: spp.external_post_url,
        };
      });

      const mediaItems = (post.scheduled_post_media ?? [])
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0)
        )
        .map((spm: Record<string, unknown>) => {
          const m = spm.scheduler_media as Record<string, unknown> | null;
          return {
            id: spm.media_id,
            filename: m?.filename ?? '',
            storage_path: m?.storage_path ?? '',
            thumbnail_url: m?.thumbnail_url ?? null,
            late_media_url: m?.late_media_url ?? null,
            mime_type: m?.mime_type ?? null,
          };
        });

      const reviewLinks = post.post_review_links ?? [];
      let review_status: 'none' | 'pending' | 'approved' | 'changes_requested' = 'none';
      if (reviewLinks.length > 0) review_status = 'pending';

      return {
        id: post.id,
        client_id: post.client_id,
        status: post.status,
        scheduled_at: post.scheduled_at,
        caption: post.caption ?? '',
        hashtags: post.hashtags ?? [],
        post_type: post.post_type,
        cover_image_url: post.cover_image_url,
        thumbnail_url: mediaItems[0]?.thumbnail_url ?? null,
        platforms,
        review_status,
        media: mediaItems,
      };
    });

    return NextResponse.json({ posts: transformed });
  } catch (error) {
    console.error('GET /api/scheduler/posts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
