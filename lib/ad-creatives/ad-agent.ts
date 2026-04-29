/**
 * Ad generator orchestration via the OpenAI Agents SDK. Streaming counterpart
 * to `generateReferenceDrivenAdBatch` in `monthly-gift-ads.ts`. We emit a
 * typed `AdAgentEvent` union from inside scoped tools so the UI can show real
 * per-render progress instead of opaque tool boundaries.
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
  RunMessageOutputItem,
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
  brandContext?: Awaited<ReturnType<typeof getBrandContext>>;
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

// === Phases ==================================================================
//
// Each phase reads/writes ctx.state and emits events through ctx.onEvent.
// Tools below are thin wrappers around these phases so the agent can call
// them as named tools, while `runAdGenerator` can also call them directly
// to backfill anything the LLM orchestrator skips. Phases guard on state so
// re-entry is a no-op (defense-in-depth — callers should still gate on state
// before invoking).

async function runLoadContextPhase(ctx: AdAgentContext): Promise<string> {
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
  ctx.state.brandContext = brandContext;
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
}

async function runComposePhase(ctx: AdAgentContext): Promise<string> {
  if (!ctx.state.referenceAds) {
    throw new Error(
      'compose phase called before load_creative_context — load_creative_context first.',
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
    brandContext: ctx.state.brandContext,
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
}

async function runRenderPhase(ctx: AdAgentContext): Promise<string> {
  const concepts = ctx.state.concepts;
  if (!concepts || !ctx.state.batchId) {
    throw new Error(
      'render phase called before compose_concept_batch — compose_concept_batch first.',
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
}

// === Tools ===================================================================

const emptyParams = z.object({});

const loadCreativeContextTool = tool<typeof emptyParams, AdAgentContext>({
  name: 'load_creative_context',
  description:
    'Load brand DNA, brand asset count, and matched reference ads for the current client. ALWAYS call this FIRST before composing concepts.',
  parameters: emptyParams,
  async execute(_args, runContext) {
    return runLoadContextPhase(requireContext(runContext));
  },
});

const composeConceptBatchTool = tool<typeof emptyParams, AdAgentContext>({
  name: 'compose_concept_batch',
  description:
    'Compose the ad concept copy + image prompts using the user brief, brand DNA, and the reference ads loaded in the previous step. Persists the batch and returns a summary. Call this AFTER load_creative_context and BEFORE render_batch_images.',
  parameters: emptyParams,
  async execute(_args, runContext) {
    return runComposePhase(requireContext(runContext));
  },
});

const renderBatchImagesTool = tool<typeof emptyParams, AdAgentContext>({
  name: 'render_batch_images',
  description:
    'Render images for every concept in the current batch via gpt-image-2. Streams per-image progress to the user. Call this AFTER compose_concept_batch.',
  parameters: emptyParams,
  async execute(_args, runContext) {
    return runRenderPhase(requireContext(runContext));
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
  brandContext?: Awaited<ReturnType<typeof getBrandContext>>;
}

interface ComposeAndPersistOutput {
  batchId: string;
  concepts: GeneratedConceptRow[];
}

import { parseConcepts, type RawConcept } from './parse-concepts';
export { parseConcepts };

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
  const brandContext =
    input.brandContext ??
    (await getBrandContext(input.clientId, { bypassCache: true }));
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
- Never render the brand's logo, wordmark, or any approximation of one. Brand recognition comes from product, palette, and typography — not a rendered logo. The image generator cannot draw logos accurately and any attempt will be wrong.
- If Brand DNA describes a specific physical product, render it exactly as described — no stylization, no reinterpretation, no decorative embellishment, no invented features. If you cannot describe the product faithfully from Brand DNA alone, prefer a typographic or lifestyle ad with no product imagery over an inaccurate render.
- These prompts will be rendered immediately, so keep them visually concrete and avoid vague art direction.

# image_prompt rules (gpt-image-2)

Each image_prompt is a creative brief in plain prose. Write it like you're directing a photographer or designer — a paragraph or two, not a numbered list and not JSON. gpt-image-2 reads natural direction better than rigid structure.

Cover, in whatever order reads naturally:

- The scene and subject — what we're looking at, framing, lighting.
- On-image text — write the exact copy in double quotes, e.g. headline "Sleep deeper tonight". For tricky words, spell them letter-by-letter so the render keeps them legible. Note rough placement (top, lower third, centered) and the feel of the type (clean sans, bold display, friendly script). Don't specify hex colors for type.
- Brand feel — palette and personality in plain English (warm earth tones, premium muted neutrals, energetic neon on charcoal). No hex codes. Do not place a logo, wordmark, or brand name as a graphic element — typography in the headline is the only branded text.
- Composition cues — what's the focal point, what reads next, where any CTA sits.
- What to avoid — no logos of any kind (including the brand's own), no wordmarks, no watermarks, no clip-art icons, no stock-photo feel, no decorative gradients, no unrelated text.

For photoreal ads add "photorealistic, professional campaign photography." For graphic ads add "clean editorial layout" or "flat magazine illustration."

Keep prompts tight enough that medium quality reads cleanly — only flag dense small type as needing high quality.

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
    if (!(item instanceof RunMessageOutputItem)) continue;
    const text = item.content?.trim();
    if (text) {
      options.onEvent({ type: 'agent_message', text });
    }
  }

  // Backfill any phases the orchestrator skipped. gpt-5-mini sometimes stops
  // after compose_concept_batch and never calls render_batch_images, leaving
  // the user with a fake "completed" batch and an empty gallery. Each phase
  // guards on state, so re-entry is safe; runRenderPhase still throws terminal
  // errors directly, which propagate to the route as a real batch_error.
  if (!context.state.brandContext) {
    await runLoadContextPhase(context);
  }
  if (!context.state.concepts || !context.state.batchId) {
    await runComposePhase(context);
  }
  if (!context.state.renderedConcepts) {
    options.onEvent({ type: 'agent_message', text: 'Rendering images now…' });
    await runRenderPhase(context);
  }

  // The render tool throws terminal errors (KEY_MISSING / AUTH_FAILED /
  // QUOTA_EXHAUSTED) so the SDK surfaces them — but the SDK catches tool
  // throws and feeds them back to the model rather than re-throwing. If the
  // run finished with a stored terminal error and zero rendered concepts,
  // promote it back into a real exception so the route emits batch_error
  // instead of a fake batch_complete with an empty gallery.
  const terminal = context.state.terminalRenderError;
  if (terminal && (context.state.renderedConcepts?.length ?? 0) === 0) {
    throw terminal;
  }

  // Agent finished — assemble the final result from context state. A concept
  // without a rendered image is not a deliverable, so don't fall back to
  // composed concepts here: an empty `renderedConcepts` means render never
  // ran or every render failed, and the status logic below will mark the
  // batch failed/partial accordingly.
  const concepts = context.state.renderedConcepts ?? [];
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

