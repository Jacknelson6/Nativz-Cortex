import { createAdminClient } from '@/lib/supabase/admin';

export interface HealthBreakdown {
  searchFrequency: number;    // 0-25
  shootActivity: number;      // 0-20
  moodboardActivity: number;  // 0-15
  recency: number;            // 0-25
  contentOutput: number;      // 0-15
}

export interface ClientHealth {
  score: number;              // 0-100
  breakdown: HealthBreakdown;
  lastActivityAt: string | null;
}

/**
 * Calculate a health score (0-100) for a client based on recent activity.
 */
export async function calculateClientHealth(clientId: string): Promise<ClientHealth> {
  const supabase = createAdminClient();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [searches, shoots, moodboards, ideas] = await Promise.all([
    // Recent searches (last 90 days)
    supabase
      .from('topic_searches')
      .select('created_at')
      .eq('client_id', clientId)
      .gte('created_at', ninetyDaysAgo)
      .order('created_at', { ascending: false }),

    // Shoots (last 90 days)
    supabase
      .from('shoot_events')
      .select('shoot_date')
      .eq('client_id', clientId)
      .gte('shoot_date', ninetyDaysAgo)
      .order('shoot_date', { ascending: false }),

    // Moodboard boards
    supabase
      .from('moodboard_boards')
      .select('created_at, updated_at')
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false }),

    // Ideas (last 90 days)
    supabase
      .from('idea_submissions')
      .select('created_at')
      .eq('client_id', clientId)
      .gte('created_at', ninetyDaysAgo)
      .order('created_at', { ascending: false }),
  ]);

  const searchList = searches.data ?? [];
  const shootList = shoots.data ?? [];
  const moodboardList = moodboards.data ?? [];
  const ideaList = ideas.data ?? [];

  // --- Search frequency (0-25) ---
  // 5+ searches in 30 days = max, scale linearly
  const recentSearches = searchList.filter(
    (s) => new Date(s.created_at) >= new Date(thirtyDaysAgo),
  ).length;
  const searchFrequency = Math.min(25, Math.round((recentSearches / 5) * 25));

  // --- Shoot activity (0-20) ---
  // 3+ shoots in 90 days = max
  const shootActivity = Math.min(20, Math.round((shootList.length / 3) * 20));

  // --- Moodboard activity (0-15) ---
  // Any moodboard updated in last 30 days = good
  const recentMoodboards = moodboardList.filter(
    (m) => new Date(m.updated_at ?? m.created_at) >= new Date(thirtyDaysAgo),
  ).length;
  const moodboardActivity = Math.min(15, Math.round((recentMoodboards / 2) * 15));

  // --- Recency (0-25) ---
  // Days since last interaction of any type
  const allDates = [
    ...searchList.map((s) => s.created_at),
    ...shootList.map((s) => s.shoot_date),
    ...moodboardList.map((m) => m.updated_at ?? m.created_at),
    ...ideaList.map((i) => i.created_at),
  ].filter(Boolean);

  const lastActivityAt = allDates.length > 0
    ? allDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
    : null;

  let recency = 0;
  if (lastActivityAt) {
    const daysSince = (now.getTime() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 3) recency = 25;
    else if (daysSince <= 7) recency = 20;
    else if (daysSince <= 14) recency = 15;
    else if (daysSince <= 30) recency = 10;
    else if (daysSince <= 60) recency = 5;
    else recency = 0;
  }

  // --- Content output (0-15) ---
  // 5+ ideas in 90 days = max
  const contentOutput = Math.min(15, Math.round((ideaList.length / 5) * 15));

  const breakdown: HealthBreakdown = {
    searchFrequency,
    shootActivity,
    moodboardActivity,
    recency,
    contentOutput,
  };

  const score = searchFrequency + shootActivity + moodboardActivity + recency + contentOutput;

  return {
    score: Math.min(100, score),
    breakdown,
    lastActivityAt,
  };
}

/**
 * Calculate health scores for multiple clients in parallel.
 */
export async function calculateAllClientHealth(
  clientIds: string[],
): Promise<Map<string, ClientHealth>> {
  const results = await Promise.allSettled(
    clientIds.map(async (id) => ({ id, health: await calculateClientHealth(id) })),
  );

  const map = new Map<string, ClientHealth>();
  for (const result of results) {
    if (result.status === 'fulfilled') {
      map.set(result.value.id, result.value.health);
    }
  }
  return map;
}
