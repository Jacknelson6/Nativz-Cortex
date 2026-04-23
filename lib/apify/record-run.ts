/**
 * Apify run cost tracking.
 *
 * Every completed Apify run (success or fail) writes one row to `apify_runs`
 * with cost / compute / dataset-count metadata pulled from the Apify run
 * detail endpoint. Callers pass `context` so we can attribute spend back to
 * a topic_search + client for billing.
 *
 * See migration 147_apify_runs.sql for schema.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export interface ApifyRunContext {
  /** Short label: 'reddit' | 'web_serp' | 'tiktok' | 'youtube' | 'audit_tiktok' | ... */
  purpose: string;
  /** When the run is part of a topic search, attribute cost to it. */
  topicSearchId?: string | null;
  /** When the run is for a specific client (audit scrapes, ecom, etc.). */
  clientId?: string | null;
}

interface ApifyRunDetail {
  status: string;
  statusMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  stats?: {
    computeUnits?: number;
    durationMillis?: number;
  };
  usage?: Record<string, number>;
  usageTotalUsd?: number;
  defaultDatasetId?: string;
}

async function fetchRunDetail(runId: string, apiKey: string): Promise<ApifyRunDetail | null> {
  try {
    const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.data ?? null) as ApifyRunDetail | null;
  } catch {
    return null;
  }
}

async function fetchDatasetItemCount(datasetId: string, apiKey: string): Promise<number | null> {
  if (!datasetId) return null;
  try {
    const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}?token=${apiKey}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const count = data?.data?.itemCount;
    return typeof count === 'number' ? count : null;
  } catch {
    return null;
  }
}

/**
 * Record one Apify run to the `apify_runs` table. Non-fatal — logs and returns
 * on failure so cost tracking never blocks a scrape.
 */
export async function recordApifyRun(params: {
  runId: string;
  actorId: string;
  apiKey: string;
  context: ApifyRunContext;
  /** Set when the run never started (e.g. startApifyActorRun returned null). */
  startFailure?: { error: string };
}): Promise<void> {
  const { runId, actorId, apiKey, context, startFailure } = params;

  try {
    const supabase = createAdminClient();

    if (startFailure) {
      await supabase.from('apify_runs').insert({
        run_id: `${actorId}:start-fail:${Date.now()}`,
        actor_id: actorId,
        purpose: context.purpose,
        topic_search_id: context.topicSearchId ?? null,
        client_id: context.clientId ?? null,
        status: 'START_FAILED',
        error: startFailure.error.slice(0, 500),
        completed_at: new Date().toISOString(),
      });
      return;
    }

    const detail = await fetchRunDetail(runId, apiKey);
    const datasetItems = detail?.defaultDatasetId
      ? await fetchDatasetItemCount(detail.defaultDatasetId, apiKey)
      : null;

    const startedAt = detail?.startedAt ? new Date(detail.startedAt) : new Date();
    const finishedAt = detail?.finishedAt ? new Date(detail.finishedAt) : null;
    const durationMs = detail?.stats?.durationMillis
      ?? (finishedAt ? finishedAt.getTime() - startedAt.getTime() : null);

    await supabase.from('apify_runs').insert({
      run_id: runId,
      actor_id: actorId,
      purpose: context.purpose,
      topic_search_id: context.topicSearchId ?? null,
      client_id: context.clientId ?? null,
      status: detail?.status ?? 'UNKNOWN',
      cost_usd: detail?.usageTotalUsd ?? null,
      compute_units: detail?.stats?.computeUnits ?? null,
      dataset_items: datasetItems,
      duration_ms: durationMs,
      started_at: startedAt.toISOString(),
      completed_at: finishedAt?.toISOString() ?? null,
      error: detail?.status && detail.status !== 'SUCCEEDED'
        ? (detail.statusMessage ?? detail.status).slice(0, 500)
        : null,
    });
  } catch (err) {
    console.error('[apify] recordApifyRun failed (non-fatal):', err);
  }
}
