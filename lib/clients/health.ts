import { createAdminClient } from '@/lib/supabase/admin';

export interface HealthBreakdown {
  searchFrequency: number;    // 0-20
  shootActivity: number;      // 0-15
  moodboardActivity: number;  // 0-10
  recency: number;            // -20 to +20 (bonus/penalty)
  contentOutput: number;      // 0-10
}

export interface ClientHealth {
  score: number;              // 0-100
  isNew: boolean;             // true if client has zero data
  breakdown: HealthBreakdown;
  lastActivityAt: string | null;
}

/**
 * Calculate a health score (0-100) for a client based on recent activity.
 * Base score of 50 for all active clients (neutral starting point).
 * If a client has zero data at all, mark as "new".
 */
export async function calculateClientHealth(clientId: string): Promise<ClientHealth> {
  const supabase = createAdminClient();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [searches, shoots, moodboards, ideas] = await Promise.all([
    supabase
      .from('topic_searches')
      .select('created_at')
      .eq('client_id', clientId)
      .gte('created_at', ninetyDaysAgo)
      .order('created_at', { ascending: false }),
    supabase
      .from('shoot_events')
      .select('shoot_date')
      .eq('client_id', clientId)
      .gte('shoot_date', ninetyDaysAgo)
      .order('shoot_date', { ascending: false }),
    supabase
      .from('moodboard_boards')
      .select('created_at, updated_at')
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false }),
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

  // Check if client has any data at all
  const totalItems = searchList.length + shootList.length + moodboardList.length + ideaList.length;
  const isNew = totalItems === 0;

  if (isNew) {
    return {
      score: 0,
      isNew: true,
      breakdown: { searchFrequency: 0, shootActivity: 0, moodboardActivity: 0, recency: 0, contentOutput: 0 },
      lastActivityAt: null,
    };
  }

  // BASE SCORE: 50
  const BASE = 50;

  // --- Search frequency (0-20): 4+ searches in 30 days = max ---
  const recentSearches = searchList.filter(
    (s) => new Date(s.created_at) >= new Date(thirtyDaysAgo),
  ).length;
  const searchFrequency = Math.min(20, Math.round((recentSearches / 4) * 20));

  // --- Shoot activity (0-15): 3+ shoots in 90 days = max ---
  const shootActivity = Math.min(15, Math.round((shootList.length / 3) * 15));

  // --- Moodboard activity (0-10): any moodboard updated in last 30 days ---
  const recentMoodboards = moodboardList.filter(
    (m) => new Date(m.updated_at ?? m.created_at) >= new Date(thirtyDaysAgo),
  ).length;
  const moodboardActivity = Math.min(10, Math.round((recentMoodboards / 2) * 10));

  // --- Recency bonus/penalty (-20 to +20) ---
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
    if (daysSince <= 3) recency = 20;
    else if (daysSince <= 7) recency = 15;
    else if (daysSince <= 14) recency = 10;
    else if (daysSince <= 30) recency = 5;
    else if (daysSince <= 60) recency = -5;
    else if (daysSince <= 90) recency = -10;
    else recency = -20;
  }

  // --- Content output (0-10): 5+ ideas in 90 days = max ---
  const contentOutput = Math.min(10, Math.round((ideaList.length / 5) * 10));

  const breakdown: HealthBreakdown = {
    searchFrequency,
    shootActivity,
    moodboardActivity,
    recency,
    contentOutput,
  };

  const raw = BASE + searchFrequency + shootActivity + moodboardActivity + recency + contentOutput;
  const score = Math.max(0, Math.min(100, raw));

  return { score, isNew: false, breakdown, lastActivityAt };
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
