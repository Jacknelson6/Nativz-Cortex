import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';
import type { SocialPlatform } from '@/lib/posting/types';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';

export const maxDuration = 300;

const MAX_RETRIES = 3;
const BATCH_SIZE = 5;

/**
 * GET /api/cron/publish-posts
 *
 * Vercel cron job (every 2 minutes): publish scheduled posts that are due. Processes up to
 * 5 posts per run. Implements exponential backoff retry (up to 3 attempts). Sends an in-app
 * failure notification when all retries are exhausted. Requires CRON_SECRET bearer token.
 *
 * @auth Bearer CRON_SECRET (Vercel cron)
 * @returns {{ message: string, published: number, failed: number }}
 */
async function handleGet(request: NextRequest) {
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
            access_token_ref,
            late_account_id
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

        // Build platform profile map. Zernio expects its own MongoDB
        // ObjectId (`social_profiles.late_account_id`) as the platform
        // accountId, NOT our internal UUID. Drop any spp rows whose
        // social profile hasn't been connected to Zernio yet (no
        // late_account_id) -- they'd 400 anyway. Keep an internal
        // map so we can reverse-lookup the spp row when Zernio echoes
        // accountId back in the publish response.
        const platformProfiles = (post.scheduled_post_platforms ?? [])
          .map((spp: Record<string, unknown>) => {
            const profile = spp.social_profiles as Record<string, unknown> | null;
            const lateAccountId = (profile?.late_account_id ?? null) as string | null;
            if (!lateAccountId) return null;
            return {
              profileId: spp.social_profile_id as string,
              lateAccountId,
              platform: (profile?.platform ?? 'instagram') as SocialPlatform,
            };
          })
          .filter(
            (p): p is { profileId: string; lateAccountId: string; platform: SocialPlatform } =>
              p !== null,
          );

        if (platformProfiles.length === 0) {
          throw new Error(
            'No connected social profiles to publish to (missing late_account_id). Reconnect the social profile via Zernio.',
          );
        }

        const platformHints: Record<string, SocialPlatform> = {};
        platformProfiles.forEach((p) => {
          platformHints[p.lateAccountId] = p.platform;
        });

        // Reverse map: late_account_id (what Zernio echoes back) -> our
        // internal social_profile_id (UUID), so we can update the right
        // spp row from the publish response.
        const lateIdToProfileId: Record<string, string> = {};
        platformProfiles.forEach((p) => {
          lateIdToProfileId[p.lateAccountId] = p.profileId;
        });

        // Publish via posting service
        const result = await postingService.publishPost({
          videoUrl: publicUrl.publicUrl,
          caption: post.caption ?? '',
          hashtags: post.hashtags ?? [],
          coverImageUrl: post.cover_image_url ?? undefined,
          taggedPeople: post.tagged_people ?? [],
          collaboratorHandles: post.collaborator_handles ?? [],
          platformProfileIds: platformProfiles.map((p) => p.lateAccountId),
          platformHints,
        });

        // Update per-platform results
        let allPublished = true;
        let anyFailed = false;

        for (const platformResult of result.platforms) {
          // Zernio returns the late_account_id we sent it; translate
          // back to our internal UUID before matching the spp row.
          const internalProfileId =
            lateIdToProfileId[platformResult.profileId] ?? platformResult.profileId;
          const spp = (post.scheduled_post_platforms ?? []).find(
            (s: Record<string, unknown>) => s.social_profile_id === internalProfileId,
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

export const GET = withCronTelemetry({ route: '/api/cron/publish-posts' }, handleGet);

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
  const postUrl = `${appUrl}/admin/scheduling?post=${post.id}`;
  const caption = ((post.caption as string) ?? '').substring(0, 100);

  // Create in-app notification
  await adminClient.from('notifications').insert({
    recipient_user_id: createdBy,
    organization_id: null,
    type: 'report_published', // Reusing existing type for now
    title: `Post failed to publish`,
    body: `Post for ${client?.name ?? 'Unknown client'} failed after 3 retries: "${caption}..."`,
    link_path: `/admin/scheduling?post=${post.id}`,
    is_read: false,
    email_sent: false,
  });

  // TODO: Send actual email via Resend/SendGrid when email service is configured
  console.log(`[PUBLISH FAILURE] userId=${post.created_by} postId=${post.id} clientId=${post.client_id} reason=${post.failure_reason}`);
}
