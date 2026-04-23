/**
 * Vercel Workflow wrapper for the topic-search pipeline.
 *
 * See docs/spec-vercel-workflow-migration.md for the full migration plan.
 *
 * Phase 1 (this file) — one-step wrapper:
 *   runTopicSearchPipelineStep runs the existing `runLlmTopicPipeline` as a
 *   single `"use step"`. This gives us workflow-level durability (the
 *   function survives Vercel SIGKILL + redeploys, and the step auto-retries
 *   on transient failures) without refactoring the 800-line pipeline into
 *   per-stage steps. Phase 3 splits it up.
 *
 * Activation:
 *   The workflow is dormant until `/api/search/[id]/process/route.ts` calls
 *   `start(topicSearchWorkflow, ...)`. That call is env-gated behind
 *   `USE_WORKFLOW_PIPELINE=1` so production behaviour is unchanged until we
 *   flip the flag intentionally.
 *
 * Invariants the workflow relies on:
 *   • The caller has already passed auth, budget guard, and lease
 *     acquisition. Workflow doesn't re-check those — it just runs the
 *     pipeline.
 *   • `runLlmTopicPipeline` is responsible for all `topic_searches` row
 *     mutations (status transitions, error_message, pipeline_state). The
 *     step returns void; state persistence happens inside the pipeline.
 *   • Retries must be idempotent. `runLlmTopicPipeline` is NOT fully
 *     idempotent today — a retry re-runs the pipeline from scratch and
 *     double-charges Apify / OpenRouter. We accept this for phase 1
 *     because Workflow caps retries at 3 by default. Phase 3 splits into
 *     per-stage steps with checkpointing so retries are cheap.
 */

import { FatalError } from 'workflow';
import { runLlmTopicPipeline } from '@/lib/search/llm-pipeline/run-llm-topic-pipeline';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Structured log for workflow telemetry. Matches the `logLlmV1` pattern
 * used elsewhere in the pipeline so the same log pipeline can ingest both.
 */
function logWorkflow(event: Record<string, unknown>): void {
  console.log(`[topic_search_workflow] ${JSON.stringify(event)}`);
}

// ── Step: run the full pipeline ─────────────────────────────────────────

/**
 * Hydrate the topic_searches row and run the full pipeline. Marked
 * `"use step"` so Workflow gives us automatic retries on transient errors
 * + crash recovery. Throws `FatalError` for conditions where a retry is
 * pointless (row missing, user revoked, budget tripped by a pipeline
 * stage).
 */
async function runTopicSearchPipelineStep(args: {
  searchId: string;
  userId: string;
  userEmail: string | undefined;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  'use step';

  const stepStartedAt = Date.now();
  logWorkflow({
    phase: 'pipeline_step_start',
    search_id: args.searchId,
    user_id: args.userId,
  });

  const admin = createAdminClient();

  const { data: search, error } = await admin
    .from('topic_searches')
    .select('*')
    .eq('id', args.searchId)
    .single();

  if (error || !search) {
    throw new FatalError(
      `topic_searches row ${args.searchId} not found — nothing to run`,
    );
  }

  // Hydrate client context (brand voice, industry) — optional, but the
  // pipeline uses it when present. Parallel single lookup; failure is
  // non-fatal since `clientContext: null` is a valid path.
  let clientContext: Parameters<typeof runLlmTopicPipeline>[0]['clientContext'] = null;
  if (search.client_id) {
    const { data: client } = await admin
      .from('clients')
      .select('name, industry, brand_voice')
      .eq('id', search.client_id)
      .single();
    if (client) {
      clientContext = {
        name: client.name,
        industry: client.industry,
        brandVoice: client.brand_voice,
      };
    }
  }

  const platforms: string[] = search.platforms ?? ['web'];

  await runLlmTopicPipeline({
    searchId: args.searchId,
    search: {
      query: search.query,
      time_range: search.time_range,
      country: search.country,
      language: search.language,
      search_mode: (search.search_mode ?? 'general') as 'general' | 'client_strategy',
      client_id: search.client_id,
      subtopics: search.subtopics,
    },
    userId: args.userId,
    userEmail: args.userEmail,
    clientContext,
    platforms: platforms as import('@/lib/types/search').SearchPlatform[],
  });

  logWorkflow({
    phase: 'pipeline_step_end',
    search_id: args.searchId,
    duration_ms: Date.now() - stepStartedAt,
  });

  return { ok: true };
}

// ── Workflow: orchestrates the pipeline step ────────────────────────────

/**
 * Durable workflow entry point. Call via `start(topicSearchWorkflow, [...])`
 * from an API route; the function suspends/resumes across Vercel function
 * invocations, so a single workflow can outlive the HTTP request that
 * started it.
 */
export async function topicSearchWorkflow(
  searchId: string,
  userId: string,
  userEmail: string | undefined,
): Promise<{ searchId: string; ok: boolean; reason?: string }> {
  'use workflow';

  logWorkflow({ phase: 'workflow_start', search_id: searchId });
  const result = await runTopicSearchPipelineStep({ searchId, userId, userEmail });
  logWorkflow({
    phase: 'workflow_end',
    search_id: searchId,
    ok: result.ok,
    reason: result.ok ? undefined : result.reason,
  });

  if (!result.ok) {
    return { searchId, ok: false, reason: result.reason };
  }
  return { searchId, ok: true };
}
