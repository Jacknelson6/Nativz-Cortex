// SPY-03 T07: read-side queries for prospect_analyses.

import { createAdminClient } from '@/lib/supabase/admin';
import type { ProspectAnalysisRow } from './types';

const RERUN_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function getLatestAnalysis(
  prospectId: string,
): Promise<ProspectAnalysisRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('prospect_analyses')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ProspectAnalysisRow | null) ?? null;
}

export async function getAnalysisById(
  prospectId: string,
  runId: string,
): Promise<ProspectAnalysisRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('prospect_analyses')
    .select('*')
    .eq('prospect_id', prospectId)
    .eq('run_id', runId)
    .maybeSingle();
  return (data as ProspectAnalysisRow | null) ?? null;
}

/**
 * Re-run is allowed unless the most recent succeeded/partial run is
 * <6h old. Failed runs don't gate the next attempt (otherwise a flaky
 * run would lock the prospect out).
 */
export async function canRerun(
  prospectId: string,
): Promise<{ ok: boolean; retryAfterSec: number }> {
  const latest = await getLatestAnalysis(prospectId);
  if (!latest) return { ok: true, retryAfterSec: 0 };
  if (latest.status !== 'succeeded' && latest.status !== 'partial') {
    return { ok: true, retryAfterSec: 0 };
  }
  const ageMs = Date.now() - new Date(latest.created_at).getTime();
  if (ageMs >= RERUN_WINDOW_MS) return { ok: true, retryAfterSec: 0 };
  return { ok: false, retryAfterSec: Math.ceil((RERUN_WINDOW_MS - ageMs) / 1000) };
}
