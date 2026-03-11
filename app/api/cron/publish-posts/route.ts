import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';
import type { SocialPlatform } from '@/lib/posting/types';

export const maxDuration = 300;

const MAX_RETRIES = 3;
const BATCH_SIZE = 5;

// Vercel cron job — runs every 2 minutes to publish scheduled posts.
// Configure in vercel.json: schedule "every 2 minutes"
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const postingService = getPostingService();

    // Find posts ready to publish
    const { data: pendingPosts, error: queryError } = await adminClient
      .from('scheduled_posts')
      .select(`
        *,
        scheduled_post_platforms (
          id,
          social_profile_id,
          status,
          social_profiles (
            id,
            platform,
            username,
            access_token_ref
          )
        ),
        scheduled_post_media (
          scheduler_media (
            storage_path,
            thumbnail_url
          )
        )
      `)
      .in('status', ['scheduled', 'publishing'])
      .lte('scheduled_at', new Date().toISOString())
      .lt('retry_count', MAX_RETRIES)
      .order('scheduled_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (queryError) {
      console.error('Cron query error:', queryError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    if (!pendingPosts?.length) {
      return NextResponse.json({ message: 'No posts to publish', count: 0 });
    }

    let publishedCount = 0;
    let failedCount = 0;

    for (const post of pendingPosts) {
      try {
        // Mark as publishing
        await adminClient
          .from('scheduled_posts')
          .update({ status: 'publishing', updated_at: new Date().toISOString() })
          .eq('id', post.id);

        // Get video URL from media
        const media = post.scheduled_post_media?.[0]?.scheduler_media;
        if (!media?.storage_path) {
          throw new Error('No media attached to post');
        }

        const { data: publicUrl } = adminClient.storage
          .from('scheduler-media')
          .getPublicUrl(media.storage_path);

        // Build platform profile map
        const platformProfiles = (post.scheduled_post_platforms ?? []).map(
          (spp: Record<string, unknown>) => {
            const profile = spp.social_profiles as Record<string, unknown> | null;
            return {
              profileId: spp.social_profile_id as string,
              platform: (profile?.platform ?? 'instagram') as SocialPlatform,
            };
          }
        );

        const platformHints: Record<string, SocialPlatform> = {};
        platformProfiles.forEach((p: { profileId: string; platform: SocialPlatform }) => {
          platformHints[p.profileId] = p.platform;
        });

        // Publish via posting service
        const result = await postingService.publishPost({
          videoUrl: publicUrl.publicUrl,
          caption: post.caption ?? '',
          hashtags: post.hashtags ?? [],
          coverImageUrl: post.cover_image_url ?? undefined,
          taggedPeople: post.tagged_people ?? [],
          collaboratorHandles: post.collaborator_handles ?? [],
          platformProfileIds: platformProfiles.map((p: { profileId: string }) => p.profileId),
          platformHints,
        });

        // Update per-platform results
        let allPublished = true;
        let anyFailed = false;

        for (const platformResult of result.platforms) {
          const spp = (post.scheduled_post_platforms ?? []).find(
            (s: Record<string, unknown>) => s.social_profile_id === platformResult.profileId
          );
          if (spp) {
            await adminClient
              .from('scheduled_post_platforms')
              .update({
                status: platformResult.status === 'published' ? 'published' : 'failed',
                external_post_id: platformResult.externalPostId ?? null,
                external_post_url: platformResult.externalPostUrl ?? null,
                failure_reason: platformResult.error ?? null,
              })
              .eq('id', (spp as Record<string, unknown>).id);
          }

          if (platformResult.status !== 'published') allPublished = false;
          if (platformResult.status === 'failed') anyFailed = true;
        }

        // Update post status
        const newStatus = allPublished
          ? 'published'
          : anyFailed
            ? 'partially_failed'
            : 'published';

        await adminClient
          .from('scheduled_posts')
          .update({
            status: newStatus,
            external_post_id: result.externalPostId,
            published_at: allPublished ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', post.id);

        publishedCount++;
      } catch (err) {
        console.error(`Failed to publish post ${post.id}:`, err);

        const newRetryCount = (post.retry_count ?? 0) + 1;
        const newStatus = newRetryCount >= MAX_RETRIES ? 'failed' : 'scheduled';

        await adminClient
          .from('scheduled_posts')
          .update({
            status: newStatus,
            retry_count: newRetryCount,
            failure_reason: err instanceof Error ? err.message : 'Unknown error',
            // Exponential backoff: retry in 2^n minutes
            scheduled_at: newStatus === 'scheduled'
              ? new Date(Date.now() + Math.pow(2, newRetryCount) * 60 * 1000).toISOString()
              : post.scheduled_at,
            updated_at: new Date().toISOString(),
          })
          .eq('id', post.id);

        failedCount++;

        // If all retries exhausted, send failure email
        if (newRetryCount >= MAX_RETRIES) {
          try {
            await sendFailureNotification(adminClient, post);
          } catch (emailErr) {
            console.error('Failed to send failure notification:', emailErr);
          }
        }
      }
    }

    return NextResponse.json({
      message: `Processed ${pendingPosts.length} posts`,
      published: publishedCount,
      failed: failedCount,
    });
  } catch (error) {
    console.error('POST /api/cron/publish-posts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function sendFailureNotification(
  adminClient: ReturnType<typeof createAdminClient>,
  post: Record<string, unknown>
) {
  // Get creator's email
  const createdBy = post.created_by as string | null;
  if (!createdBy) return;

  const { data: creator } = await adminClient
    .from('users')
    .select('email, full_name')
    .eq('id', createdBy)
    .single();

  if (!creator?.email) return;

  // Get client name
  const { data: client } = await adminClient
    .from('clients')
    .select('name')
    .eq('id', post.client_id)
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const postUrl = `${appUrl}/admin/scheduler?post=${post.id}`;
  const caption = ((post.caption as string) ?? '').substring(0, 100);

  // Create in-app notification
  await adminClient.from('notifications').insert({
    recipient_user_id: createdBy,
    organization_id: null,
    type: 'report_published', // Reusing existing type for now
    title: `Post failed to publish`,
    body: `Post for ${client?.name ?? 'Unknown client'} failed after 3 retries: "${caption}..."`,
    link_path: `/admin/scheduler?post=${post.id}`,
    is_read: false,
    email_sent: false,
  });

  // TODO: Send actual email via Resend/SendGrid when email service is configured
  console.log(`[PUBLISH FAILURE] Would email ${creator.email}: Post ${post.id} for ${client?.name} failed. Reason: ${post.failure_reason}`);
}
