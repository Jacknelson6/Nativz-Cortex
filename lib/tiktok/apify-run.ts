/**
 * Shared Apify run lifecycle: start run, poll until SUCCEEDED, fetch dataset items.
 */

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
