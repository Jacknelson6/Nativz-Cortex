/**
 * NAT-17 — Safer consolidation path. Reads go through the
 * `unified_competitors` / `unified_competitor_snapshots` views (migration 129),
 * so new UI can converge on one shape while writes stay split across
 * `client_competitors` and `client_benchmarks` until every caller is migrated.
 *
 * `source` discriminates between 'legacy' (client_competitors + competitor_
 * snapshots) and 'audit' (client_benchmarks + benchmark_snapshots).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface UnifiedCompetitor {
  id: string;
  client_id: string;
  platform: string | null;
  username: string | null;
  profile_url: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  source: 'legacy' | 'audit';
  benchmark_id: string | null;
  audit_id: string | null;
}

export interface UnifiedCompetitorSnapshot {
  id: string;
  competitor_key: string; // legacy: competitor_id, audit: benchmark_id
  platform: string | null;
  username: string | null;
  profile_url: string | null;
  display_name: string | null;
  followers: number | null;
  posts_count: number | null;
  avg_views: number | null;
  engagement_rate: number | null;
  posting_frequency: string | null;
  followers_delta: number | null;
  new_posts: unknown | null;
  scrape_error: string | null;
  captured_at: string;
  source: 'legacy' | 'audit';
  benchmark_id: string | null;
}

export async function listUnifiedCompetitorsForClient(
  admin: SupabaseClient,
  clientId: string,
): Promise<UnifiedCompetitor[]> {
  const { data, error } = await admin
    .from('unified_competitors')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as UnifiedCompetitor[];
}

export async function listUnifiedSnapshotsByKey(
  admin: SupabaseClient,
  competitorKeys: string[],
): Promise<UnifiedCompetitorSnapshot[]> {
  if (competitorKeys.length === 0) return [];
  const { data, error } = await admin
    .from('unified_competitor_snapshots')
    .select('*')
    .in('competitor_key', competitorKeys)
    .order('captured_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as UnifiedCompetitorSnapshot[];
}
