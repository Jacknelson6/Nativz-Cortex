/**
 * Shared Apify run lifecycle: start run, poll until SUCCEEDED, fetch dataset items.
 *
 * Most new code should use `runAndLogApifyActor` (at the bottom of this file)
 * which also writes a row to `apify_runs` for cost tracking — without it we
 * go blind on actors that aren't reddit or SERP.
 */
import { recordApifyRun, type ApifyRunContext } from '@/lib/apify/record-run';

export async function startApifyActorRun(
  actorId: string,
  input: Record<string, unknown>,
  apiKey: string,
): Promise<string | null> {
  const encoded = encodeURIComponent(actorId);
  const runRes = await fetch(`https://api.apify.com/v2/acts/${encoded}/runs?token=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30000),
  });

  if (!runRes.ok) {
    console.error('Apify actor start failed:', actorId, runRes.status, await runRes.text().catch(() => ''));
    return null;
  }

  const runData = await runRes.json();
  const runId = runData?.data?.id;
  return typeof runId === 'string' ? runId : null;
}

export async function waitForApifyRunSuccess(
  runId: string,
  apiKey: string,
  maxWaitMs: number,
  pollIntervalMs: number,
): Promise<boolean> {
  const startTime = Date.now();
  let succeeded = false;

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    const status = statusData?.data?.status;
    if (status === 'SUCCEEDED') {
      succeeded = true;
      break;
    }
    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      console.error('Apify run failed:', status);
      return false;
    }
  }

  if (!succeeded) {
    try {
      const finalStatusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (finalStatusRes.ok) {
        const finalStatusData = await finalStatusRes.json();
        succeeded = finalStatusData?.data?.status === 'SUCCEEDED';
      }
    } catch {
      /* ignore */
    }
  }

  if (!succeeded) {
    console.error('Apify run timed out after', maxWaitMs / 1000, 'seconds');
  }
  return succeeded;
}

export async function fetchApifyDatasetItems(
  runId: string,
  apiKey: string,
  limit: number,
): Promise<unknown[]> {
  const datasetRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}&limit=${limit}`,
    { signal: AbortSignal.timeout(60000) },
  );
  if (!datasetRes.ok) return [];
  const items = await datasetRes.json();
  return Array.isArray(items) ? items : [];
}

/**
 * One-shot helper: start an actor run, wait for success, fetch items, and
 * log the run to `apify_runs` — all with a single call.
 *
 * Use this from new scraper code so we capture every actor's cost, not
 * just reddit + SERP. On failure (start failed, timed out, aborted) we
 * still record the row so we can see dollars spent even on partial runs.
 */
export async function runAndLogApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  apiKey: string,
  options: {
    /** Defaults to 4 minutes — most scrapers finish well under this. */
    maxWaitMs?: number;
    pollIntervalMs?: number;
    /** Defaults to 1000 — increase only when you know you need more. */
    fetchLimit?: number;
    context: ApifyRunContext;
  },
): Promise<{ runId: string | null; items: unknown[]; succeeded: boolean }> {
  const { context } = options;
  const runId = await startApifyActorRun(actorId, input, apiKey);

  if (!runId) {
    await recordApifyRun({
      runId: '',
      actorId,
      apiKey,
      context,
      startFailure: { error: `Actor ${actorId} failed to start` },
    });
    return { runId: null, items: [], succeeded: false };
  }

  const succeeded = await waitForApifyRunSuccess(
    runId,
    apiKey,
    options.maxWaitMs ?? 240_000,
    options.pollIntervalMs ?? 3000,
  );

  // Log regardless of success — we're billed for compute either way.
  await recordApifyRun({ runId, actorId, apiKey, context });

  if (!succeeded) return { runId, items: [], succeeded: false };

  const items = await fetchApifyDatasetItems(runId, apiKey, options.fetchLimit ?? 1000);
  return { runId, items, succeeded: true };
}

/**
 * Fetch the human-readable reason a run failed. Returns the actor's statusMessage
 * (usually a one-liner explaining why the actor threw), so callers can throw a
 * descriptive error instead of the useless "Apify scrape timed out" wrapper.
 */
export async function getApifyRunFailureReason(
  runId: string,
  apiKey: string,
): Promise<string> {
  try {
    const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return `Apify API returned ${res.status}`;
    const data = await res.json();
    const status = data?.data?.status as string | undefined;
    const statusMessage = data?.data?.statusMessage as string | undefined;
    if (status && statusMessage) return `${status}: ${statusMessage}`;
    if (status) return status;
    return 'Unknown failure';
  } catch {
    return 'Unknown failure (could not fetch run details)';
  }
}
