import { createAdminClient } from '@/lib/supabase/admin';
import { ZernioPostingService } from '@/lib/posting/zernio';
import { notifyAdmins } from '@/lib/notifications';
import type { NotificationPreferences } from '@/lib/types/notification-preferences';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/types/notification-preferences';

/**
 * Hourly velocity check — detects posts picking up speed.
 *
 * 1. Fetch fresh analytics from Zernio API
 * 2. Upsert current metrics into post_metrics
 * 3. Compare to last velocity snapshot
 * 4. If views/engagement jumped significantly → notify
 * 5. Save new velocity snapshot
 */
export async function checkPostVelocity(): Promise<{
  checked: number;
  trending: number;
  errors: string[];
}> {
  const admin = createAdminClient();
  const zernio = new ZernioPostingService();
  const errors: string[] = [];
  let checked = 0;
  let trending = 0;

  // Load global thresholds from admin preferences
  const { data: admins } = await admin
    .from('users')
    .select('notification_preferences')
    .eq('role', 'admin');

  const allPrefs = (admins ?? []).map((a) => ({
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...(a.notification_preferences ?? {}),
  })) as NotificationPreferences[];

  const trendingEnabled = allPrefs.some((p) => p.trendingPost?.enabled);
  if (!trendingEnabled) {
    return { checked: 0, trending: 0, errors: [] };
  }

  // Use the most sensitive thresholds
  const enabledPrefs = allPrefs.filter((p) => p.trendingPost?.enabled);
  const viewsPctThreshold = Math.min(
    ...enabledPrefs.map((p) => p.trendingPost?.viewsPercentIncrease ?? 100),
  );
  const minViewGain = Math.min(
    ...enabledPrefs.map((p) => p.trendingPost?.minViewGain ?? 500),
  );

  // Get all clients with social profiles
  const { data: clients } = await admin
    .from('social_profiles')
    .select('client_id, late_account_id, platform, clients!inner(id, name)')
    .not('late_account_id', 'is', null);

  if (!clients?.length) {
    return { checked: 0, trending: 0, errors: [] };
  }

  // Fetch fresh analytics from Zernio
  let analyticsData;
  try {
    analyticsData = await zernio.getFullAnalytics();
  } catch (err) {
    return { checked: 0, trending: 0, errors: [`Failed to fetch Zernio analytics: ${err}`] };
  }

  const posts = analyticsData.posts ?? [];
  if (!posts.length) {
    return { checked: 0, trending: 0, errors: [] };
  }

  // Build a map of late_account_id → client info
  const accountToClient = new Map<string, { clientId: string; clientName: string }>();
  for (const sp of clients) {
    const client = sp.clients as unknown as { id: string; name: string };
    if (sp.late_account_id) {
      accountToClient.set(sp.late_account_id, {
        clientId: client.id,
        clientName: client.name,
      });
    }
  }

  // Process each published post
  for (const post of posts) {
    if (post.status !== 'published' || !post.publishedAt) continue;

    // Find which client this post belongs to
    const postAccount = post.platforms?.find((pl) => accountToClient.has(pl.accountId));
    if (!postAccount) continue;

    const { clientId, clientName } = accountToClient.get(postAccount.accountId)!;
    const analytics = post.analytics;
    if (!analytics) continue;

    const currentViews = analytics.views ?? 0;
    const currentLikes = analytics.likes ?? 0;
    const currentComments = analytics.comments ?? 0;
    const currentShares = analytics.shares ?? 0;
    const currentEngagement = currentLikes + currentComments + currentShares + (analytics.saves ?? 0);

    // Find or create the post_metrics row
    const externalId = post._id;
    let { data: postMetric } = await admin
      .from('post_metrics')
      .select('id')
      .eq('external_post_id', externalId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (!postMetric) {
      // Insert fresh post metric
      const { data: inserted } = await admin
        .from('post_metrics')
        .insert({
          client_id: clientId,
          social_profile_id: null,
          platform: post.platform ?? 'instagram',
          external_post_id: externalId,
          post_url: post.platformPostUrl,
          thumbnail_url: post.thumbnailUrl,
          caption: post.content,
          post_type: post.mediaType,
          published_at: post.publishedAt,
          views_count: currentViews,
          likes_count: currentLikes,
          comments_count: currentComments,
          shares_count: currentShares,
          saves_count: analytics.saves ?? 0,
          reach_count: analytics.reach ?? 0,
          engagement_rate: analytics.engagementRate ?? 0,
          fetched_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      postMetric = inserted;
    } else {
      // Update existing metrics
      await admin
        .from('post_metrics')
        .update({
          views_count: currentViews,
          likes_count: currentLikes,
          comments_count: currentComments,
          shares_count: currentShares,
          saves_count: analytics.saves ?? 0,
          reach_count: analytics.reach ?? 0,
          engagement_rate: analytics.engagementRate ?? 0,
          fetched_at: new Date().toISOString(),
        })
        .eq('id', postMetric.id);
    }

    if (!postMetric?.id) continue;
    checked++;

    // Get the last velocity snapshot for this post
    const { data: lastSnapshot } = await admin
      .from('post_velocity')
      .select('views_count, likes_count, engagement, checked_at')
      .eq('post_metric_id', postMetric.id)
      .order('checked_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Save new velocity snapshot
    await admin.from('post_velocity').insert({
      post_metric_id: postMetric.id,
      client_id: clientId,
      views_count: currentViews,
      likes_count: currentLikes,
      comments_count: currentComments,
      shares_count: currentShares,
      engagement: currentEngagement,
    });

    // Compare to previous snapshot
    if (!lastSnapshot) continue; // First snapshot, nothing to compare

    const prevViews = lastSnapshot.views_count ?? 0;
    const viewGain = currentViews - prevViews;
    const viewPctChange = prevViews > 0 ? (viewGain / prevViews) * 100 : 0;

    const prevEngagement = lastSnapshot.engagement ?? 0;
    const engagementGain = currentEngagement - prevEngagement;

    // Check if this post is trending
    const isTrending =
      viewGain >= minViewGain && viewPctChange >= viewsPctThreshold;

    if (isTrending) {
      // Dedup: only notify once per post per 6 hours
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const postUrl = post.platformPostUrl ?? externalId;
      const { count } = await admin
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'post_trending')
        .like('link_path', `%${postUrl}%`)
        .gte('created_at', sixHoursAgo);

      if ((count ?? 0) === 0) {
        const platform = post.platform ?? 'instagram';
        const viewGainStr = viewGain.toLocaleString();
        const engagementGainStr = engagementGain > 0 ? `, +${engagementGain.toLocaleString()} engagements` : '';

        await notifyAdmins({
          type: 'post_trending',
          title: `${clientName} — ${platform} post is picking up speed`,
          body: post.thumbnailUrl ?? undefined,
          linkPath: post.platformPostUrl ?? `/admin/analytics?client=${clientId}`,
          clientId,
        });

        trending++;
        console.log(
          `[velocity] ${clientName} ${platform}: +${viewGainStr} views (+${viewPctChange.toFixed(0)}%)${engagementGainStr}`,
        );
      }
    }
  }

  // Clean up old velocity snapshots (keep last 72h)
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  await admin.from('post_velocity').delete().lt('checked_at', cutoff);

  return { checked, trending, errors };
}
