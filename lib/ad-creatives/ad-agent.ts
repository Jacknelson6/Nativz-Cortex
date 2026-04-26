/**
 * Ad generator orchestration via the OpenAI Agents SDK.
 *
 * This is the streaming counterpart to `generateReferenceDrivenAdBatch` in
 * `monthly-gift-ads.ts`. The legacy function runs the same pipeline as a
 * single submit-and-wait call; this module hands the workflow to an Agent
 * that calls scoped tools and streams progress back to the caller.
 *
 * Layout:
 *   - One Agent (`Cortex Ad Director`) running gpt-5.4-mini on OpenAI direct.
 *   - Three tools wired to context: load_creative_context → compose_concept_batch
 *     → render_batch_images. Each tool emits granular SSE events through the
 *     `onEvent` callback that the route plumbs into a ReadableStream.
 *   - The agent's narration between tool calls flows through `message_output_created`
 *     stream events and is forwarded to the UI as `agent_message`.
 *
 * Why a custom event channel on top of `RunStreamEvent`: the SDK surfaces
 * tool calls as opaque `tool_called` / `tool_output` items, which is fine for
 * an inspector but useless for "rendered concept 12 of 20". We emit our own
 * typed `AdAgentEvent` union from inside the tools so the UI can show real
 * progress (a thumbnail per render) instead of a generic "Tool finished" line.
 */

import { OpenAI } from 'openai';
import {
  Agent,
  run,
  tool,
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
  type RunContext,
} from '@openai/agents';
import { z } from 'zod';

import { createAdminClient } from '@/lib/supabase/admin';
import { createOpenRouterRichCompletion } from '@/lib/ai/openrouter-rich';
import { getBrandContext } from '@/lib/knowledge/brand-context';
import { resolveOpenAiApiKeyForFeature } from '@/lib/ai/provider-keys';
import {
  formatReferenceAdsForPrompt,
  selectReferenceAdsForBrand,
  type ReferenceAd,
} from '@/lib/ad-creatives/reference-ad-library';
import { OpenAiImageError } from '@/lib/ad-creatives/openai-image';
import {
  renderConceptImageWithOpenAI,
  type GeneratedConceptRow,
} from '@/lib/ad-creatives/monthly-gift-ads';

// === Public event surface ====================================================

export type AdAgentEvent =
  | { type: 'agent_started'; brief: string; count: number }
  | { type: 'agent_message'; text: string }
  | { type: 'tool_started'; tool: string; label: string }
  | { type: 'tool_finished'; tool: string; summary: string }
  | {
      type: 'context_loaded';
      brandName: string;
      assetCount: number;
      referenceAdCount: number;
    }
  | {
      type: 'concepts_composed';
      batchId: string;
      concepts: GeneratedConceptRow[];
      referenceAdsUsed: number;
    }
  | { type: 'concept_rendering'; index: number; total: number; slug: string }
  | {
      type: 'concept_rendered';
      index: number;
      total: number;
      concept: GeneratedConceptRow;
    }
  | {
      type: 'concept_render_failed';
      index: number;
      total: number;
      conceptId: string;
      slug: string;
      code: string;
      message: string;
    }
  | {
      type: 'batch_complete';
      batchId: string;
      status: 'completed' | 'partial' | 'failed';
      concepts: GeneratedConceptRow[];
      referenceAdsUsed: number;
      summary: string;
    }
  | { type: 'batch_error'; code: string; message: string };

export interface RunAdGeneratorOptions {
  clientId: string;
  prompt: string;
  count: number;
  userId: string | null;
  userEmail: string | null;
  onEvent: (event: AdAgentEvent) => void;
}

export interface RunAdGeneratorResult {
  batchId: string | null;
  status: 'completed' | 'partial' | 'failed';
  concepts: GeneratedConceptRow[];
  referenceAdsUsed: number;
  summary: string;
  finalMessage: string;
}

// === Internal context passed to tools ========================================

interface AdAgentContextState {
  batchId?: string;
  referenceAds?: ReferenceAd[];
  concepts?: GeneratedConceptRow[];
  renderedConcepts?: GeneratedConceptRow[];
  renderFailures?: number;
  terminalRenderError?: OpenAiImageError;
}

interface AdAgentContext {
  clientId: string;
  prompt: string;
  count: number;
  userId: string | null;
  userEmail: string | null;
  onEvent: (event: AdAgentEvent) => void;
  state: AdAgentContextState;
}

function requireContext(
  runContext: RunContext<AdAgentContext> | undefined,
): AdAgentContext {
  if (!runContext?.context) {
    throw new Error('Agent tool invoked without context');
  }
  return runContext.context;
}

// === Runtime setup (key-rotation aware) ======================================

const ORCHESTRATOR_MODEL = process.env.AD_AGENT_MODEL?.trim() || 'gpt-5-mini';
const CONCEPT_MODEL =
  process.env.AD_CONCEPT_MODEL?.trim() || 'openai/gpt-5.4-mini';

let runtimeKey: string | null = null;

/**
 * Idempotent runtime setup. Resolves the OpenAI key on every run so a key
 * rotation in Cortex settings takes effect without redeploying. The OpenAI
 * client + API selection are only re-set when the key actually changes.
 */
async function ensureAgentRuntime(): Promise<void> {
  const apiKey = await resolveOpenAiApiKeyForFeature('ad_image_generation');
  if (!apiKey) {
    throw new OpenAiImageError(
      'KEY_MISSING',
      'OpenAI API key is not configured. Add a key in Cortex settings → AI credentials before generating images.',
    );
  }
  if (apiKey !== runtimeKey) {
    setDefaultOpenAIClient(new OpenAI({ apiKey }));
    setOpenAIAPI('chat_completions');
    setTracingDisabled(true);
    runtimeKey = apiKey;
  }
}

// === Tools ===================================================================

const emptyParams = z.object({});

const loadCreativeContextTool = tool<typeof emptyParams, AdAgentContext>({
  name: 'load_creative_context',
  description:
    'Load brand DNA, brand asset count, and matched reference ads for the current client. ALWAYS call this FIRST before composing concepts.',
  parameters: emptyParams,
  async execute(_args, runContext) {
    const ctx = requireContext(runContext);
    ctx.onEvent({
      type: 'tool_started',
      tool: 'load_creative_context',
      label: 'Loading brand DNA + matched reference ads…',
    });
    const admin = createAdminClient();
    const [brandContext, assetsResult] = await Promise.all([
      getBrandContext(ctx.clientId, { bypassCache: true }),
      admin.from('ad_assets').select('id').eq('client_id', ctx.clientId),
    ]);
    const referenceAds = await selectReferenceAdsForBrand(
      brandContext,
      Math.max(ctx.count, 20),
    );
    ctx.state.referenceAds = referenceAds;
    const brandName = brandContext.clientName || 'this client';
    const assetCount = assetsResult.data?.length ?? 0;
    const referenceAdCount = referenceAds.length;
    ctx.onEvent({
      type: 'context_loaded',
      brandName,
      assetCount,
      referenceAdCount,
    });
    const summary = `${brandName}: ${assetCount} brand asset${
      assetCount === 1 ? '' : 's'
    }, ${referenceAdCount} reference ad${
      referenceAdCount === 1 ? '' : 's'
    } matched.`;
    ctx.onEvent({
      type: 'tool_finished',
      tool: 'load_creative_context',
      summary,
    });
    return summary;
  },
});

const composeConceptBatchTool = tool<typeof emptyParams, AdAgentContext>({
  name: 'compose_concept_batch',
  description:
    'Compose the ad concept copy + image prompts using the user brief, brand DNA, and the reference ads loaded in the previous step. Persists the batch and returns a summary. Call this AFTER load_creative_context and BEFORE render_batch_images.',
  parameters: emptyParams,
  async execute(_args, runContext) {
    const ctx = requireContext(runContext);
    if (!ctx.state.referenceAds) {
      throw new Error(
        'compose_concept_batch called before load_creative_context — call load_creative_context first.',
      );
    }
    ctx.onEvent({
      type: 'tool_started',
      tool: 'compose_concept_batch',
      label: `Composing ${ctx.count} concept${ctx.count === 1 ? '' : 's'}…`,
    });
    const result = await composeAndPersistConcepts({
      clientId: ctx.clientId,
      prompt: ctx.prompt,
      count: ctx.count,
      referenceAds: ctx.state.referenceAds,
      userId: ctx.userId,
    });
    ctx.state.batchId = result.batchId;
    ctx.state.concepts = result.concepts;
    ctx.onEvent({
      type: 'concepts_composed',
      batchId: result.batchId,
      concepts: result.concepts,
      referenceAdsUsed: ctx.state.referenceAds.length,
    });
    const summary = `Composed ${result.concepts.length} concept${
      result.concepts.length === 1 ? '' : 's'
    } (batch ${result.batchId.slice(0, 8)}).`;
    ctx.onEvent({
      type: 'tool_finished',
      tool: 'compose_concept_batch',
      summary,
    });
    return summary;
  },
});

const renderBatchImagesTool = tool<typeof emptyParams, AdAgentContext>({
  name: 'render_batch_images',
  description:
    'Render images for every concept in the current batch via gpt-image-2. Streams per-image progress to the user. Call this AFTER compose_concept_batch.',
  parameters: emptyParams,
  async execute(_args, runContext) {
    const ctx = requireContext(runContext);
    const concepts = ctx.state.concepts;
    if (!concepts || !ctx.state.batchId) {
      throw new Error(
        'render_batch_images called before compose_concept_batch — call compose_concept_batch first.',
      );
    }
    ctx.onEvent({
      type: 'tool_started',
      tool: 'render_batch_images',
      label: `Rendering ${concepts.length} image${
        concepts.length === 1 ? '' : 's'
      }…`,
    });
    const rendered: GeneratedConceptRow[] = [];
    let failed = 0;
    let terminalError: OpenAiImageError | undefined;
    const queue = concepts.map((c, idx) => ({ concept: c, index: idx }));
    const total = queue.length;

    // Same 2-up concurrency as the legacy renderer. Each worker pulls from
    // the shared queue and emits per-image events through the context.
    async function worker() {
      while (queue.length > 0) {
        if (terminalError) {
          // Drain remaining queue without retrying — the upstream is wedged
          // (key/auth/quota), every retry would just burn another error.
          for (const item of queue) {
            failed += 1;
            ctx.onEvent({
              type: 'concept_render_failed',
              index: item.index + 1,
              total,
              conceptId: item.concept.id,
              slug: item.concept.slug,
              code: terminalError.code,
              message: terminalError.message,
            });
          }
          queue.length = 0;
          return;
        }
        const next = queue.shift();
        if (!next) return;
        const indexOneBased = next.index + 1;
        ctx.onEvent({
          type: 'concept_rendering',
          index: indexOneBased,
          total,
          slug: next.concept.slug,
        });
        try {
          const updated = await renderConceptImageWithOpenAI(next.concept.id, {
            userId: ctx.userId,
            userEmail: ctx.userEmail,
          });
          rendered.push(updated);
          ctx.onEvent({
            type: 'concept_rendered',
            index: indexOneBased,
            total,
            concept: updated,
          });
        } catch (err) {
          failed += 1;
          if (err instanceof OpenAiImageError) {
            ctx.onEvent({
              type: 'concept_render_failed',
              index: indexOneBased,
              total,
              conceptId: next.concept.id,
              slug: next.concept.slug,
              code: err.code,
              message: err.message,
            });
            if (isTerminalForBatch(err.code)) {
              terminalError = err;
            }
          } else {
            ctx.onEvent({
              type: 'concept_render_failed',
              index: indexOneBased,
              total,
              conceptId: next.concept.id,
              slug: next.concept.slug,
              code: 'unknown_error',
              message: err instanceof Error ? err.message : 'Unknown error',
            });
          }
        }
      }
    }

    const concurrency = Math.min(2, queue.length);
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    ctx.state.renderedConcepts = rendered;
    ctx.state.renderFailures = failed;
    ctx.state.terminalRenderError = terminalError;

    const summary = `Rendered ${rendered.length}/${total} image${
      total === 1 ? '' : 's'
    }${failed > 0 ? ` (${failed} failed)` : ''}.`;
    ctx.onEvent({
      type: 'tool_finished',
      tool: 'render_batch_images',
      summary,
    });
    if (terminalError) {
      // Terminate the run via thrown error so the agent surfaces a final
      // user-facing message that explains the wall (key missing, quota, etc.).
      throw terminalError;
    }
    return summary;
  },
});

function isTerminalForBatch(code: OpenAiImageError['code']): boolean {
  return (
    code === 'KEY_MISSING' ||
    code === 'AUTH_FAILED' ||
    code === 'QUOTA_EXHAUSTED'
  );
}

// === Agent definition ========================================================

const AD_AGENT_INSTRUCTIONS = `You are Cortex's Ad Director. Your job is to turn a creative brief into a batch of static ads grounded in Brand DNA and proven reference-ad mechanics.

Workflow — call tools in EXACTLY this order:
1. load_creative_context  — confirms the brand and how many reference ads matched.
2. compose_concept_batch  — composes the concept copy + image prompts and saves the batch.
3. render_batch_images    — renders all images via gpt-image-2.

Style rules:
- Between tool calls, give the user one short, sentence-case status line in the present tense ("Loading brand DNA…", "Composing 20 concepts…", "Rendering images now…"). No more than one sentence each. Never write multi-paragraph commentary mid-run.
- After the final tool returns, write a one-paragraph summary that names the brand, the count, and any partial-render warnings. Skip "I" — speak as Cortex.
- If a tool throws an error, do not retry. Report the error briefly and stop.
- Never invent concept data, reference ads, or render results. Only the tools produce those.`;

// === Concept composition (private — used by the compose tool) ================

interface ComposeAndPersistInput {
  clientId: string;
  prompt: string;
  count: number;
  referenceAds: ReferenceAd[];
  userId: string | null;
}

interface ComposeAndPersistOutput {
  batchId: string;
  concepts: GeneratedConceptRow[];
}

interface RawConcept {
  reference_ad_id?: unknown;
  template_name?: unknown;
  headline?: unknown;
  body_copy?: unknown;
  visual_description?: unknown;
  source_grounding?: unknown;
  image_prompt?: unknown;
}

/**
 * Composes the concept copy via OpenRouter (Claude / GPT) and inserts the
 * batch + concept rows. Mirrors the inner half of the legacy
 * `generateReferenceDrivenAdBatch`, but does NOT render images — that's the
 * render_batch_images tool's job.
 */
async function composeAndPersistConcepts(
  input: ComposeAndPersistInput,
): Promise<ComposeAndPersistOutput> {
  const admin = createAdminClient();
  const brandContext = await getBrandContext(input.clientId, {
    bypassCache: true,
  });
  const { data: assetsData } = await admin
    .from('ad_assets')
    .select('id, kind, label, notes, tags')
    .eq('client_id', input.clientId)
    .order('created_at', { ascending: false })
    .limit(200);
  const assets = assetsData ?? [];
  const imageModel =
    process.env.CHATGPT_IMAGE_MODEL ??
    process.env.OPENAI_IMAGE_MODEL ??
    'gpt-image-2';

  const { data: batchRow, error: batchErr } = await admin
    .from('ad_generation_batches')
    .insert({
      client_id: input.clientId,
      status: 'generating',
      total_count: input.count,
      completed_count: 0,
      failed_count: 0,
      config: {
        pipeline: 'chatgpt_image_chat',
        user_prompt: input.prompt,
        reference_ad_ids: input.referenceAds.map((r) => r.id),
        asset_ids: assets.map((a) => a.id),
        image_model: imageModel,
        render_images: true,
        orchestrator: 'openai_agents_sdk',
      },
      brand_context_source: 'brand_dna',
      created_by: input.userId,
    })
    .select('id')
    .single();
  if (batchErr || !batchRow) {
    throw new Error(
      `Failed to create batch: ${batchErr?.message ?? 'unknown'}`,
    );
  }

  try {
    const { data: slugStart, error: slugErr } = await admin.rpc(
      'reserve_ad_concept_slugs',
      { p_client_id: input.clientId, p_count: input.count },
    );
    if (slugErr || typeof slugStart !== 'number') {
      throw new Error(
        `Slug reservation failed: ${slugErr?.message ?? 'unknown'}`,
      );
    }

    const systemPrompt = buildSystemPrompt({
      count: input.count,
      brandBlock: brandContext.toPromptBlock(),
      assets,
      referenceAds: input.referenceAds,
    });

    const completion = await createOpenRouterRichCompletion({
      feature: 'monthly_gift_ad_concepts',
      userId: input.userId ?? undefined,
      modelPreference: [CONCEPT_MODEL],
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input.prompt },
      ],
      temperature: 0.75,
      maxTokens: 9000,
    });

    const rawConcepts = parseConcepts(completion.text ?? '').slice(
      0,
      input.count,
    );
    if (rawConcepts.length === 0) {
      throw new Error('Model returned no parseable concepts');
    }

    const referenceIds = new Set(input.referenceAds.map((r) => r.id));
    const rows = rawConcepts.map((concept, idx) => {
      const referenceId = strOrNull(concept.reference_ad_id);
      return {
        client_id: input.clientId,
        batch_id: batchRow.id,
        slug: `concept-${String(slugStart + idx).padStart(3, '0')}`,
        template_name: strOr(
          concept.template_name,
          'Reference-driven static ad',
        ),
        headline: strOr(concept.headline, 'Untitled concept'),
        body_copy: strOrNull(concept.body_copy),
        visual_description: strOrNull(concept.visual_description),
        source_grounding: strOr(
          concept.source_grounding,
          'Grounded in Brand DNA and matched reference ads',
        ),
        image_prompt: strOr(concept.image_prompt, ''),
        reference_ad_id:
          referenceId && referenceIds.has(referenceId) ? referenceId : null,
        status: 'pending',
        position: idx,
        pipeline: 'chatgpt_image_chat',
        generation_model: CONCEPT_MODEL,
        metadata: {
          reference_model: 'matched_reference_ads',
          requested_count: input.count,
          orchestrator: 'openai_agents_sdk',
        },
      };
    });

    const { data: inserted, error: insertErr } = await admin
      .from('ad_concepts')
      .insert(rows)
      .select(
        'id, slug, template_name, template_id, headline, body_copy, visual_description, source_grounding, image_prompt, image_storage_path, status, position, notes, created_at, updated_at',
      );
    if (insertErr || !inserted) {
      throw new Error(
        `Concept insert failed: ${insertErr?.message ?? 'unknown'}`,
      );
    }

    return {
      batchId: batchRow.id,
      concepts: inserted as GeneratedConceptRow[],
    };
  } catch (err) {
    await admin
      .from('ad_generation_batches')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', batchRow.id);
    throw err;
  }
}

interface PromptInputs {
  count: number;
  brandBlock: string;
  assets: Array<{
    id: string;
    kind: string;
    label: string;
    notes: string | null;
    tags: string[] | null;
  }>;
  referenceAds: ReferenceAd[];
}

function buildSystemPrompt({
  count,
  brandBlock,
  assets,
  referenceAds,
}: PromptInputs): string {
  const assetManifest =
    assets.length === 0
      ? '(none uploaded)'
      : assets
          .map((a) => {
            const tagBlock =
              a.tags && a.tags.length > 0 ? ` [${a.tags.join(', ')}]` : '';
            return `- (${a.kind}) "${a.label}"${tagBlock}${
              a.notes ? ` — ${a.notes}` : ''
            }`;
          })
          .join('\n');

  return `You are Nativz Cortex's monthly performance-ad system. Create ${count} static ads as a client gift.

The ads must feel like they came from the brand, but their structures should be inspired by proven reference ads that have historically performed well.

# Brand DNA

${brandBlock}

# Uploaded brand assets

${assetManifest}

# Matched proven reference ads

${formatReferenceAdsForPrompt(referenceAds)}

# Concept requirements

- Produce exactly ${count} concepts.
- Each concept must use one matched reference ad when available. Put that row's UUID in reference_ad_id.
- Do not copy another brand's logo, product, copy, claims, testimonials, or proprietary marks.
- Borrow only the reusable mechanism: layout, pacing, hierarchy, emotional angle, CTA treatment, offer framing, visual rhythm.
- Ground claims in Brand DNA or uploaded assets only. If a claim is not supported, make it softer.
- Vary the batch: testimonial/social proof, problem-solution, offer, comparison, stat callout, product/service showcase, founder/authority, and FAQ/objection.
- These prompts will be rendered immediately, so keep them visually concrete and avoid vague art direction.

# image_prompt rules (gpt-image-2)

Each image_prompt must read like a creative brief for a real photographer, not concept-art language. Follow this structure in order:

1. Scene & background — physical setting, surface, environment.
2. Subject — what is featured (product, person, object, abstract composition). Name camera framing (close-up, medium, wide), viewpoint (eye-level, low-angle, top-down), and lighting (soft diffuse, golden hour, studio key + fill).
3. On-image text — write the EXACT copy in quotes, e.g. headline "Sleep deeper tonight" rendered verbatim. Specify font character (sans / serif / display), size relative to the ad, color, and placement (top-left, lower third, etc.). For tricky words, spell out letter-by-letter.
4. Brand identity — describe brand personality and palette in plain English (warm earth tones, energetic neon accent on charcoal, premium muted neutrals). Avoid hex codes; let the model interpret tasteful color direction. Place the logo only if Brand DNA confirms a clean lockup, and name its location ("logo bottom-right, small").
5. Composition & layout — name the visual hierarchy ("subject centered, headline lower third, CTA pill bottom-right"). Reference the borrowed reference-ad mechanic by feel, not by name.
6. Constraints — list what must NOT appear: "no watermarks, no extra logos, no clip-art icons, no stock-photo feeling, no decorative gradients, no unrelated text".
7. Render mode — for photoreal ads include "photorealistic, professional campaign photography"; for graphic ads include "flat editorial illustration" or "clean magazine layout".

Quality is set to medium by default. Only the BAD_REQUEST hint "small dense type" warrants the high tier — keep prompts tight enough that medium reads cleanly.

# Output JSON

Return only JSON:

{
  "concepts": [
    {
      "reference_ad_id": "uuid from the matched reference list, or null if no reference library exists",
      "template_name": "short pattern name",
      "headline": "main on-screen headline",
      "body_copy": "supporting on-screen text or null",
      "visual_description": "plain-English description of the final ad",
      "source_grounding": "specific Brand DNA, asset label, or reference ad reason",
      "image_prompt": "full gpt-image-2 prompt following the rules above"
    }
  ]
}`;
}

function parseConcepts(raw: string): RawConcept[] {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(stripped) as unknown;
    if (Array.isArray(parsed)) return parsed as RawConcept[];
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { concepts?: unknown }).concepts)
    ) {
      return (parsed as { concepts: RawConcept[] }).concepts;
    }
  } catch {
    return [];
  }
  return [];
}

function strOr(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : fallback;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

// === Public entry point ======================================================

/**
 * Run the ad generator agent end-to-end and stream every meaningful step
 * through the supplied `onEvent` callback. The callback is the only way the
 * UI sees what's happening — agent narration, tool boundaries, per-image
 * progress, and final batch status all flow through it.
 *
 * On a clean run, returns a `RunAdGeneratorResult` after the agent's final
 * message lands. On a typed image error, throws the original `OpenAiImageError`
 * so the route can map it through `mapImageErrorToResponse` and emit the same
 * wire codes the legacy /generate route already surfaces.
 */
export async function runAdGenerator(
  options: RunAdGeneratorOptions,
): Promise<RunAdGeneratorResult> {
  await ensureAgentRuntime();

  options.onEvent({
    type: 'agent_started',
    brief: options.prompt,
    count: options.count,
  });

  const context: AdAgentContext = {
    clientId: options.clientId,
    prompt: options.prompt,
    count: options.count,
    userId: options.userId,
    userEmail: options.userEmail,
    onEvent: options.onEvent,
    state: {},
  };

  const agent = new Agent<AdAgentContext>({
    name: 'Cortex Ad Director',
    instructions: AD_AGENT_INSTRUCTIONS,
    model: ORCHESTRATOR_MODEL,
    tools: [
      loadCreativeContextTool,
      composeConceptBatchTool,
      renderBatchImagesTool,
    ],
  });

  const userMessage = `Brief: ${options.prompt}\n\nGenerate ${options.count} ads. Begin.`;

  const result = await run(agent, userMessage, {
    context,
    stream: true,
  });

  // Forward agent narration messages to the UI as they land. Tool boundaries
  // already flow through context.onEvent, so we ignore tool_called / tool_output
  // here to avoid double-emitting.
  for await (const event of result) {
    if (event.type !== 'run_item_stream_event') continue;
    if (event.name !== 'message_output_created') continue;
    const item = event.item;
    if (item.type !== 'message_output_item') continue;
    const text = extractMessageText(item);
    if (text) {
      options.onEvent({ type: 'agent_message', text });
    }
  }

  // Agent finished — assemble the final result from context state.
  const concepts =
    context.state.renderedConcepts ?? context.state.concepts ?? [];
  const batchId = context.state.batchId ?? null;
  const referenceAdsUsed = context.state.referenceAds?.length ?? 0;
  const failures = context.state.renderFailures ?? 0;
  const status: 'completed' | 'partial' | 'failed' =
    !batchId
      ? 'failed'
      : failures > 0 || concepts.length < options.count
        ? 'partial'
        : 'completed';

  const finalMessage =
    typeof result.finalOutput === 'string'
      ? result.finalOutput
      : `Generated ${concepts.length} ad${
          concepts.length === 1 ? '' : 's'
        }${status === 'partial' ? ' (partial)' : ''}.`;

  // Update the batch row with the final status now that the run is done.
  if (batchId) {
    const admin = createAdminClient();
    await admin
      .from('ad_generation_batches')
      .update({
        status,
        completed_count: concepts.length,
        failed_count: failures,
        completed_at: new Date().toISOString(),
      })
      .eq('id', batchId);
  }

  options.onEvent({
    type: 'batch_complete',
    batchId: batchId ?? '',
    status,
    concepts,
    referenceAdsUsed,
    summary: finalMessage,
  });

  return {
    batchId,
    status,
    concepts,
    referenceAdsUsed,
    summary: finalMessage,
    finalMessage,
  };
}

interface MessageOutputItem {
  type: 'message_output_item';
  rawItem?: {
    content?: Array<{ type?: string; text?: string }>;
  };
}

function extractMessageText(item: unknown): string | null {
  const candidate = item as MessageOutputItem;
  const parts = candidate?.rawItem?.content;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .filter((p) => p?.type === 'output_text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('')
    .trim();
  return text.length > 0 ? text : null;
}
