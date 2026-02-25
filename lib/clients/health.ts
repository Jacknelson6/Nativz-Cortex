import { createAdminClient } from '@/lib/supabase/admin';

export type HealthLabel = 'Healthy' | 'Good' | 'Needs Attention' | 'At Risk' | 'Critical' | 'New';

export interface HealthBreakdown {
  shootStatus: number;        // 0-50
  contentActivity: number;    // 0-30
  recency: number;            // 0-20
}

export interface ClientHealth {
  score: number;              // 0-100
  label: HealthLabel;
  isNew: boolean;
  breakdown: HealthBreakdown;
  lastActivityAt: string | null;
}

export function getHealthLabel(score: number, isNew: boolean): HealthLabel {
  if (isNew) return 'New';
  if (score >= 80) return 'Healthy';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Needs Attention';
  if (score >= 20) return 'At Risk';
  return 'Critical';
}

export function getHealthColor(label: HealthLabel) {
  switch (label) {
    case 'Healthy':         return { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', ring: 'stroke-emerald-400' };
    case 'Good':            return { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30', ring: 'stroke-blue-400' };
    case 'Needs Attention': return { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', ring: 'stroke-amber-400' };
    case 'At Risk':         return { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30', ring: 'stroke-orange-400' };
    case 'Critical':        return { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', ring: 'stroke-red-400' };
    case 'New':             return { bg: 'bg-zinc-500/15', text: 'text-zinc-400', border: 'border-zinc-500/30', ring: 'stroke-zinc-400' };
  }
}

/**
 * Calculate a health score (0-100) for a client based on real business indicators.
 *
 * Shoot Status (50 pts) — Content Activity (30 pts) — Recency (20 pts)
 */
export async function calculateClientHealth(clientId: string): Promise<ClientHealth> {
  const supabase = createAdminClient();
  const now = new Date();
  const dayOfMonth = now.getDate();

  // Date boundaries
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [shootsThisMonth, shootsNextMonth, searches, moodboards, ideas] = await Promise.all([
    supabase
      .from('shoots')
      .select('shoot_date, status')
      .eq('client_id', clientId)
      .gte('shoot_date', thisMonthStart)
      .lte('shoot_date', thisMonthEnd),
    supabase
      .from('shoots')
      .select('shoot_date')
      .eq('client_id', clientId)
      .gte('shoot_date', nextMonthStart)
      .lte('shoot_date', nextMonthEnd),
    supabase
      .from('topic_searches')
      .select('created_at')
      .eq('client_id', clientId)
      .gte('created_at', thirtyDaysAgo),
    supabase
      .from('moodboard_boards')
      .select('updated_at')
      .eq('client_id', clientId)
      .gte('updated_at', thirtyDaysAgo),
    supabase
      .from('ideas')
      .select('created_at')
      .eq('client_id', clientId)
      .gte('created_at', thirtyDaysAgo),
  ]);

  const thisMonthShoots = shootsThisMonth.data ?? [];
  const nextMonthShoots = shootsNextMonth.data ?? [];
  const searchList = searches.data ?? [];
  const moodboardList = moodboards.data ?? [];
  const ideaList = ideas.data ?? [];

  // Check if client has any data at all
  const totalItems = thisMonthShoots.length + nextMonthShoots.length + searchList.length + moodboardList.length + ideaList.length;
  const isNew = totalItems === 0;

  if (isNew) {
    // Also check if they have ANY historical data
    const [historicShoots, historicSearches] = await Promise.all([
      supabase.from('shoots').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
      supabase.from('topic_searches').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    ]);
    const hasAnyData = ((historicShoots.count ?? 0) + (historicSearches.count ?? 0)) > 0;
    if (!hasAnyData) {
      return {
        score: 0,
        label: 'New',
        isNew: true,
        breakdown: { shootStatus: 0, contentActivity: 0, recency: 0 },
        lastActivityAt: null,
      };
    }
  }

  // --- SHOOT STATUS (0-50) ---
  const hasCompletedShoot = thisMonthShoots.some(
    (s) => s.status === 'completed' || new Date(s.shoot_date) < now,
  );
  const hasUpcomingShootThisMonth = thisMonthShoots.some(
    (s) => new Date(s.shoot_date) >= now,
  );
  const hasShootNextMonth = (nextMonthShoots.length ?? 0) > 0;

  let shootStatus = 0;
  if (hasCompletedShoot) {
    shootStatus = 50;
  } else if (hasUpcomingShootThisMonth) {
    shootStatus = 40;
  } else if (hasShootNextMonth) {
    shootStatus = 25;
  } else if (dayOfMonth <= 15) {
    shootStatus = 20; // grace period
  } else if (dayOfMonth <= 20) {
    shootStatus = 5;
  } else {
    shootStatus = 0;
  }

  // --- CONTENT ACTIVITY (0-30) ---
  let contentActivity = 0;
  if (searchList.length > 0) contentActivity += 15;
  if (moodboardList.length > 0) contentActivity += 10;
  if (ideaList.length > 0) contentActivity += 5;

  // --- RECENCY (0-20) ---
  const allDates = [
    ...thisMonthShoots.map((s) => s.shoot_date),
    ...searchList.map((s) => s.created_at),
    ...moodboardList.map((m) => m.updated_at),
    ...ideaList.map((i) => i.created_at),
  ].filter(Boolean);

  const lastActivityAt = allDates.length > 0
    ? allDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
    : null;

  let recency = 0;
  if (lastActivityAt) {
    const daysSince = (now.getTime() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 7) recency = 20;
    else if (daysSince <= 14) recency = 15;
    else if (daysSince <= 30) recency = 10;
    else if (daysSince <= 60) recency = 5;
    else recency = 0;
  }

  const breakdown: HealthBreakdown = { shootStatus, contentActivity, recency };
  const score = Math.max(0, Math.min(100, shootStatus + contentActivity + recency));
  const label = getHealthLabel(score, false);

  return { score, label, isNew: false, breakdown, lastActivityAt };
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
