import { createAdminClient } from '@/lib/supabase/admin';
import { notifyAdmins } from '@/lib/notifications';
import type { NotificationPreferences } from '@/lib/types/notification-preferences';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/types/notification-preferences';

/**
 * Load the most permissive thresholds across all admin users.
 * Uses the lowest threshold per category so notifications are generated
 * for any admin who wants them — per-user filtering happens in notifyAdmins.
 */
async function getGlobalThresholds(): Promise<NotificationPreferences> {
  const admin = createAdminClient();
  const { data: admins } = await admin
    .from('users')
    .select('notification_preferences')
    .eq('role', 'admin');

  if (!admins?.length) return DEFAULT_NOTIFICATION_PREFERENCES;

  const allPrefs = admins.map((a) => ({
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...(a.notification_preferences ?? {}),
  })) as NotificationPreferences[];

  // Use the most permissive (lowest) threshold across all admins
  return {
    inApp: allPrefs.some((p) => p.inApp),
    email: allPrefs.some((p) => p.email),
    trendingPost: {
      enabled: allPrefs.some((p) => p.trendingPost?.enabled),
      viewsPercentIncrease: Math.min(...allPrefs.filter((p) => p.trendingPost?.enabled).map((p) => p.trendingPost?.viewsPercentIncrease ?? 100)),
      minViewGain: Math.min(...allPrefs.filter((p) => p.trendingPost?.enabled).map((p) => p.trendingPost?.minViewGain ?? 500)),
    },
    engagementOutlier: {
      enabled: allPrefs.some((p) => p.engagementOutlier?.enabled),
      threshold: Math.min(...allPrefs.filter((p) => p.engagementOutlier?.enabled).map((p) => p.engagementOutlier.threshold ?? 2)),
    },
    engagementSpike: {
      enabled: allPrefs.some((p) => p.engagementSpike?.enabled),
      percentIncrease: Math.min(...allPrefs.filter((p) => p.engagementSpike?.enabled).map((p) => p.engagementSpike.percentIncrease ?? 50)),
    },
    followerMilestone: {
      enabled: allPrefs.some((p) => p.followerMilestone?.enabled),
      interval: Math.min(...allPrefs.filter((p) => p.followerMilestone?.enabled).map((p) => p.followerMilestone.interval ?? 1000)),
    },
    viewsThreshold: {
      enabled: allPrefs.some((p) => p.viewsThreshold?.enabled),
      minViews: Math.min(...allPrefs.filter((p) => p.viewsThreshold?.enabled).map((p) => p.viewsThreshold.minViews ?? 10000)),
    },
    likesThreshold: {
      enabled: allPrefs.some((p) => p.likesThreshold?.enabled),
      minLikes: Math.min(...allPrefs.filter((p) => p.likesThreshold?.enabled).map((p) => p.likesThreshold.minLikes ?? 500)),
    },
  };
}

/**
 * Analyze a client's freshly-synced metrics and generate notifications.
 * Thresholds are driven by admin notification preferences.
 */
export async function generateAnalyticsNotifications(
  clientId: string,
  clientName: string,
): Promise<number> {
  const admin = createAdminClient();
  const thresholds = await getGlobalThresholds();
  let notificationCount = 0;

  // Find posts updated in the last 24h (shared across checks)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentPosts } = await admin
    .from('post_metrics')
    .select('id, platform, caption, post_url, thumbnail_url, likes_count, comments_count, shares_count, saves_count, views_count')
    .eq('client_id', clientId)
    .gte('fetched_at', yesterday);

  // ── 1. Engagement outliers ───────────────────────────────────────────

  if (thresholds.engagementOutlier.enabled) {
    try {
      const { data: avgData } = await admin
        .from('post_metrics')
        .select('likes_count, comments_count, shares_count, saves_count')
        .eq('client_id', clientId);

      if (avgData && avgData.length >= 3) {
        const avgEngagement =
          avgData.reduce(
            (sum, p) =>
              sum + (p.likes_count ?? 0) + (p.comments_count ?? 0) + (p.shares_count ?? 0) + (p.saves_count ?? 0),
            0,
          ) / avgData.length;

        if (recentPosts && avgEngagement > 0) {
          for (const post of recentPosts) {
            const engagement =
              (post.likes_count ?? 0) + (post.comments_count ?? 0) + (post.shares_count ?? 0) + (post.saves_count ?? 0);

            if (engagement >= avgEngagement * thresholds.engagementOutlier.threshold) {
              const dedupKey = post.post_url ?? post.id;
              const { count } = await admin
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('type', 'post_top_performer')
                .like('link_path', `%${dedupKey}%`);

              if ((count ?? 0) === 0) {
                const multiplier = (engagement / avgEngagement).toFixed(1);
                await notifyAdmins({
                  type: 'post_top_performer',
                  title: `${clientName} — ${multiplier}x average engagement`,
                  body: post.thumbnail_url ?? null,
                  linkPath: post.post_url ?? `/admin/analytics?client=${clientId}`,
                  clientId,
                });
                notificationCount++;
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`[analytics-notif] Engagement outlier check failed for ${clientName}:`, err);
    }
  }

  // ── 2. Views threshold ─────────────────────────────────────────────

  if (thresholds.viewsThreshold.enabled && recentPosts) {
    try {
      for (const post of recentPosts) {
        const views = post.views_count ?? 0;
        if (views >= thresholds.viewsThreshold.minViews) {
          const dedupKey = `views:${post.post_url ?? post.id}`;
          const { count } = await admin
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('type', 'post_top_performer')
            .like('body', `%${dedupKey}%`);

          if ((count ?? 0) === 0) {
            await notifyAdmins({
              type: 'post_top_performer',
              title: `${clientName} — ${post.platform} post hit ${views.toLocaleString()} views`,
              body: post.thumbnail_url ?? null,
              linkPath: post.post_url ?? `/admin/analytics?client=${clientId}`,
            });
            notificationCount++;
          }
        }
      }
    } catch (err) {
      console.error(`[analytics-notif] Views threshold check failed for ${clientName}:`, err);
    }
  }

  // ── 3. Likes threshold ─────────────────────────────────────────────

  if (thresholds.likesThreshold.enabled && recentPosts) {
    try {
      for (const post of recentPosts) {
        const likes = post.likes_count ?? 0;
        if (likes >= thresholds.likesThreshold.minLikes) {
          const dedupKey = `likes:${post.post_url ?? post.id}`;
          const { count } = await admin
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('type', 'post_top_performer')
            .like('body', `%${dedupKey}%`);

          if ((count ?? 0) === 0) {
            await notifyAdmins({
              type: 'post_top_performer',
              title: `${clientName} — ${post.platform} post hit ${likes.toLocaleString()} likes`,
              body: post.thumbnail_url ?? null,
              linkPath: post.post_url ?? `/admin/analytics?client=${clientId}`,
            });
            notificationCount++;
          }
        }
      }
    } catch (err) {
      console.error(`[analytics-notif] Likes threshold check failed for ${clientName}:`, err);
    }
  }

  // ── 4. Engagement spikes ───────────────────────────────────────────

  if (thresholds.engagementSpike.enabled) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data: snapshots } = await admin
        .from('platform_snapshots')
        .select('snapshot_date, engagement_count, platform')
        .eq('client_id', clientId)
        .gte('snapshot_date', weekAgo)
        .order('snapshot_date', { ascending: true });

      if (snapshots && snapshots.length >= 3) {
        const byPlatform = new Map<string, typeof snapshots>();
        for (const s of snapshots) {
          const arr = byPlatform.get(s.platform) ?? [];
          arr.push(s);
          byPlatform.set(s.platform, arr);
        }

        for (const [platform, platformSnapshots] of byPlatform) {
          const todaySnapshot = platformSnapshots.find((s) => s.snapshot_date === today);
          if (!todaySnapshot) continue;

          const olderSnapshots = platformSnapshots.filter((s) => s.snapshot_date !== today);
          if (olderSnapshots.length === 0) continue;

          const avgEngagement =
            olderSnapshots.reduce((sum, s) => sum + (s.engagement_count ?? 0), 0) / olderSnapshots.length;
          const todayEngagement = todaySnapshot.engagement_count ?? 0;
          const requiredMultiplier = 1 + thresholds.engagementSpike.percentIncrease / 100;

          if (avgEngagement > 0 && todayEngagement >= avgEngagement * requiredMultiplier) {
            const pctIncrease = Math.round(((todayEngagement - avgEngagement) / avgEngagement) * 100);

            await notifyAdmins({
              type: 'engagement_spike',
              title: `${clientName} — ${platform} engagement +${pctIncrease}%`,
              linkPath: `/admin/analytics?client=${clientId}`,
              clientId,
            });
            notificationCount++;
          }
        }
      }
    } catch (err) {
      console.error(`[analytics-notif] Engagement spike check failed for ${clientName}:`, err);
    }
  }

  // ── 5. Follower milestones ─────────────────────────────────────────

  if (thresholds.followerMilestone.enabled) {
    try {
      const interval = thresholds.followerMilestone.interval;
      const { data: latestSnapshots } = await admin
        .from('platform_snapshots')
        .select('platform, followers_count, snapshot_date')
        .eq('client_id', clientId)
        .order('snapshot_date', { ascending: false });

      if (latestSnapshots) {
        const seen = new Set<string>();
        for (const snapshot of latestSnapshots) {
          if (seen.has(snapshot.platform)) continue;
          seen.add(snapshot.platform);

          const followers = snapshot.followers_count ?? 0;
          if (followers === 0) continue;

          const milestone = Math.floor(followers / interval) * interval;
          if (milestone === 0) continue;

          const prevDate = new Date(
            new Date(snapshot.snapshot_date + 'T00:00:00').getTime() - 86400000,
          ).toISOString().split('T')[0];

          const { data: prevSnapshot } = await admin
            .from('platform_snapshots')
            .select('followers_count')
            .eq('client_id', clientId)
            .eq('platform', snapshot.platform)
            .eq('snapshot_date', prevDate)
            .maybeSingle();

          const prevFollowers = prevSnapshot?.followers_count ?? 0;
          const prevMilestone = Math.floor(prevFollowers / interval) * interval;

          if (milestone > prevMilestone && prevMilestone > 0) {
            const label = milestone >= 1000 ? `${(milestone / 1000).toFixed(0)}K` : String(milestone);
            await notifyAdmins({
              type: 'follower_milestone',
              title: `${clientName} — ${snapshot.platform} hit ${label} followers`,
              linkPath: `/admin/analytics?client=${clientId}`,
              clientId,
            });
            notificationCount++;
          }
        }
      }
    } catch (err) {
      console.error(`[analytics-notif] Follower milestone check failed for ${clientName}:`, err);
    }
  }

  return notificationCount;
}
