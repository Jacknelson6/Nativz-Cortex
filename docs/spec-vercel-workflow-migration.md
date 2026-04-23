# Vercel Workflow migration — topic search pipeline

**Status:** phase 1 shipped (SDK wired, workflow module written, env-gated in route)
**Author:** Jack + Claude, 2026-04-23
**Scope:** `/api/search/[id]/process` + `lib/search/llm-pipeline/run-llm-topic-pipeline.ts`

## Why

Today `/api/search/[id]/process` is a serverless HTTP handler that runs the
full topic-search pipeline inline, including a 3-attempt retry loop with
`setTimeout(2000)` between attempts. This is fragile on two axes:

1. **Wall-clock** — the pipeline (planner → per-subtopic research × N →
   platform scrapers → transcribe → cluster → merger → report) can exceed
   the 300s Vercel Function ceiling. When that happens, the function is
   SIGKILLed, the `topic_searches` row is left stuck in `processing`, and
   no retry logic triggers because the process is gone.
2. **Crash recovery** — any transient failure during a long run (network
   blip, Apify hiccup, OpenRouter 502) requires the whole pipeline to
   re-run from scratch inside the same request. Partial progress is thrown
   away and the user waits again.

The Vercel Workflow SDK (`workflow`) gives us durable execution: the
function can suspend, survive kills + redeploys, resume from the last
completed step, and retry transient failures automatically. This doc
captures the migration plan so future-us can finish the rollout without
archaeological digging.

## Current state (shipped this session)

- `workflow@latest` installed.
- `next.config.ts` wrapped with `withWorkflow(nextConfig)`. Zero runtime
  impact until a module uses `"use workflow"` / `"use step"` directives.
- `lib/search/workflows/topic-search-workflow.ts` exists with a workflow
  function that wraps the existing `runLlmTopicPipeline` as one `"use step"`
  boundary. Calling `start(topicSearchWorkflow, [...])` from the route
  would move execution off the synchronous request.
- `/api/search/[id]/process/route.ts` **still uses the inline retry loop**
  by default. It reads an env flag (`USE_WORKFLOW_PIPELINE=1`) to opt into
  the workflow path. The flag is unset in prod, so current behaviour is
  unchanged.

This phase-1 landing gives us:
- The SDK is on the deployed build (no "is this even installable" risk).
- The workflow function is typechecked alongside the rest of the codebase.
- A gated entry point to verify the behaviour side-by-side.

It does NOT yet give us durability in production, because the flag is off.
That's deliberate.

## How to flip it on (phase 2)

1. **Verify locally** with `USE_WORKFLOW_PIPELINE=1 npm run dev`, then
   `npx workflow web` in a second terminal to watch runs execute.
2. **Deploy to a preview branch** with the env var set only on that branch
   (via `vercel env add USE_WORKFLOW_PIPELINE preview --git-branch=<name>`).
3. **Kick a real search** on the preview URL and confirm:
   - The `/process` route returns immediately (`{ workflow: 'started' }`).
   - The existing poller in the search-processing UI sees `status` flip
     to `completed` or `failed` as normal.
   - `apify_runs` and `api_usage_logs` populate the same way they do today.
4. **Flip the prod env var** only after 10+ preview runs succeed end-to-end.

## Step granularity — phase 3 (future)

Right now the workflow is a single `"use step"` that runs the full
`runLlmTopicPipeline`. That's durable at the HTTP-request boundary (the
function can die and workflow will retry the step), but the step itself
still re-runs from scratch on retry — no fine-grained checkpointing.

The real power of Workflow comes from breaking the pipeline into smaller
steps so each can retry independently and the workflow resumes from the
last completed step. Proposed step boundaries (pulled from the existing
`logLlmV1` phase names so the telemetry lines up):

| Step                | Inputs                                  | Retry policy           |
|---------------------|-----------------------------------------|------------------------|
| `planSubtopicsStep` | search query, client context            | default (3 attempts)   |
| `researchSubtopicStep` × N | one subtopic + search context     | default; ≤3 per subtopic |
| `gatherPlatformDataStep` | query, platforms, search id          | `FatalError` on budget trip |
| `transcribeVideosStep` | TikTok source ids                      | default; Groq is flaky |
| `clusterPillarsStep` | all research + transcripts              | default                |
| `mergeAndBuildReportStep` | everything                          | default; retry-safe    |

Each step gets its own durability + retry envelope. The workflow becomes:

```ts
export async function topicSearchWorkflow(searchId: string, userId: string) {
  'use workflow';

  const plan = await planSubtopicsStep(searchId);
  const research = await Promise.all(
    plan.subtopics.map((s) => researchSubtopicStep(searchId, s)),
  );
  const platform = await gatherPlatformDataStep(searchId);
  const transcripts = await transcribeVideosStep(platform.tiktokSources);
  const pillars = await clusterPillarsStep(research, transcripts);
  return await mergeAndBuildReportStep(searchId, { plan, research, platform, transcripts, pillars });
}
```

This requires pulling state in/out of Supabase between steps (Workflow
steps should be mostly stateless — they re-execute on retry, so any
progress they make must be written to Postgres before they return, and
re-read on retry). `topic_searches.pipeline_state` already has the right
shape for this — it's how `logLlmV1` tracks stages today.

## Risks + mitigations

### Risk: `FatalError` on budget trip
The current budget guard returns HTTP 402 before any pipeline work runs.
In the workflow version, the check should live **outside** the workflow
(in the route handler, before `start(...)`) so a budget overrun doesn't
consume a workflow invocation. The current phase-1 code preserves this
ordering. Don't move it.

### Risk: Step functions are not idempotent today
`runLlmTopicPipeline` mutates `topic_searches` rows, writes to `apify_runs`,
and charges real Apify + OpenRouter money. A naive retry doubles spend.
Two mitigations:
- Workflow's default retry policy is bounded (3 attempts for steps by
  default; see [`Step` docs](https://useworkflow.dev/docs/foundations/steps)).
  We get a capped blast radius.
- For phase-3 splitting, each step should check if its output already
  exists in `topic_searches.pipeline_state.stages` and short-circuit
  if so. We already track per-stage completion there.

### Risk: The existing search-processing UI assumes synchronous completion
It polls `topic_searches.status` — it already tolerates async. Confirmed
in `components/search/search-processing.tsx:pollStatusRef`.

### Risk: Long sleeps charge money
Workflow `sleep('7 days')` is free — no compute consumed. We don't use
`sleep` in this pipeline (no "wait for approval" pattern) so this is
N/A, but noting it for future audit stages.

### Risk: The workflow SDK internal routes need middleware exclusion
Per the Next.js getting-started guide, if the project has a middleware,
`.well-known/workflow/*` must be excluded from the matcher so workflow's
internal HTTP plumbing works. Cortex's `middleware.ts` should be audited
before flipping the prod env var. TODO before phase 2.

## Observability

Once active, workflow runs are visible via:
- `npx workflow web` — local UI at `localhost:XXXX`.
- `npx workflow inspect runs` — CLI.
- The Vercel dashboard (under "Workflows" — shown for projects with active
  workflow functions).

The existing `topic_search_llm_v1` structured logs in `runLlmTopicPipeline`
continue to fire inside the step, so logs-based observability (DataDog,
Grafana, whatever) keeps working.

## Rollback plan

Unset `USE_WORKFLOW_PIPELINE` in Vercel env. The route immediately falls
back to the inline retry loop. No database state to unwind because the
workflow writes to the same `topic_searches` row via the same pipeline
code path.

## References

- [Workflow SDK getting started (Next.js)](https://useworkflow.dev/docs/getting-started/next)
- [`use workflow` directive](https://useworkflow.dev/docs/foundations/workflows)
- [`use step` directive](https://useworkflow.dev/docs/foundations/steps)
- [Deploying on Vercel](https://useworkflow.dev/docs/deploying/world/vercel-world)
- Package tarball inspected: `workflow@4.2.4` (published 2026-04 era)
