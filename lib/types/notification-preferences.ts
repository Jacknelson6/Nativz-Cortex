export interface NotificationPreferences {
  /** Master toggles */
  inApp: boolean;
  email: boolean;

  /** Engagement outliers — notify when a post hits Nx above average */
  engagementOutlier: {
    enabled: boolean;
    /** Minimum multiplier to trigger (e.g. 2 = 2x average) */
    threshold: number;
  };

  /** Follower milestones — notify when crossing a follower count */
  followerMilestone: {
    enabled: boolean;
    /** Milestone interval (e.g. 1000 = every 1K, 10000 = every 10K) */
    interval: number;
  };

  /** Views threshold — notify when a post exceeds X views */
  viewsThreshold: {
    enabled: boolean;
    /** Minimum views to trigger notification */
    minViews: number;
  };

  /** Likes threshold — notify when a post exceeds X likes */
  likesThreshold: {
    enabled: boolean;
    /** Minimum likes to trigger notification */
    minLikes: number;
  };

  /** Engagement spikes — notify when daily engagement jumps */
  engagementSpike: {
    enabled: boolean;
    /** Minimum % increase over 7-day average to trigger */
    percentIncrease: number;
  };

  /** Trending/viral detection — notify when a post is picking up speed */
  trendingPost: {
    enabled: boolean;
    /** Minimum % increase in views over the last hour to trigger */
    viewsPercentIncrease: number;
    /** Minimum absolute view gain per hour to trigger (avoids noise on low-view posts) */
    minViewGain: number;
  };
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  inApp: true,
  email: true,
  engagementOutlier: { enabled: true, threshold: 2 },
  followerMilestone: { enabled: true, interval: 1000 },
  viewsThreshold: { enabled: false, minViews: 10000 },
  likesThreshold: { enabled: false, minLikes: 500 },
  engagementSpike: { enabled: true, percentIncrease: 50 },
  trendingPost: { enabled: true, viewsPercentIncrease: 100, minViewGain: 500 },
};
