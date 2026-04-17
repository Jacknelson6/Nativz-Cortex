// ---------------------------------------------------------------------------
// Ad Creatives v2 — Batch Orchestrator
// ---------------------------------------------------------------------------
//
// Runs a v2 batch: loads concepts from ad_generation_batches.config.v2_concepts,
// composes each one through the v2 pipeline, uploads PNGs to the
// `ad-creatives` bucket, inserts `ad_creatives` rows. Progress-updates the
// batch row after each work item. Respects a `cancelled` status.
//
// Pattern ports v1's orchestrate-batch.ts structure (same concurrency
// semaphore, same cancellation check, same storage path scheme) but calls
// v2 compose() instead of the v1 image generation path.

import { createAdminClient } from "@/lib/supabase/admin";
import { composeV2 } from "./compose.js";
import type { ConceptSpec } from "./types.js";

const MAX_CONCURRENCY = 3;

interface V2BatchConfig {
  v2_concepts: ConceptSpec[];
  /** Metadata only — not used for rendering. */
  v2_label?: string;
}

async function fetchBatchStatus(batchId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("ad_generation_batches")
    .select("status")
    .eq("id", batchId)
    .maybeSingle();
  const row = data as { status?: string } | null;
  return row?.status ?? null;
}

/** Run a v2 batch end-to-end. */
export async function runV2Batch(batchId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: batch, error } = await admin
    .from("ad_generation_batches")
    .select("*")
    .eq("id", batchId)
    .single();
  if (error || !batch) {
    throw new Error(
      `[v2-orchestrate] batch ${batchId} not found: ${error?.message ?? "no data"}`,
    );
  }

  const config = (batch.config ?? {}) as unknown as V2BatchConfig;
  const concepts = Array.isArray(config.v2_concepts) ? config.v2_concepts : [];
  if (concepts.length === 0) {
    throw new Error(`[v2-orchestrate] batch ${batchId} has no v2_concepts in config`);
  }

  if (batch.status === "cancelled") {
    console.warn(`[v2-orchestrate] batch ${batchId}: already cancelled`);
    return;
  }

  await admin
    .from("ad_generation_batches")
    .update({ status: "generating", total_count: concepts.length })
    .eq("id", batchId);

  console.log(
    `[v2-orchestrate] batch ${batchId}: starting ${concepts.length} concepts (client ${batch.client_id})`,
  );

  let completedCount = 0;
  let failedCount = 0;

  await runWithConcurrency(concepts, MAX_CONCURRENCY, async (concept, idx) => {
    if ((await fetchBatchStatus(batchId)) === "cancelled") return;

    try {
      const result = await composeV2(concept);

      const creativeId = crypto.randomUUID();
      const storagePath = `${batch.client_id}/${batchId}/${creativeId}.png`;

      const { error: uploadError } = await admin.storage
        .from("ad-creatives")
        .upload(storagePath, result.pngBuffer, {
          contentType: "image/png",
          upsert: false,
        });
      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      const { data: urlData } = admin.storage
        .from("ad-creatives")
        .getPublicUrl(storagePath);

      const { error: insertError } = await admin.from("ad_creatives").insert({
        id: creativeId,
        batch_id: batchId,
        client_id: batch.client_id,
        template_id: null,
        template_source: "v2",
        image_url: urlData.publicUrl,
        aspect_ratio: concept.aspect,
        prompt_used: null,
        on_screen_text: {
          headline: Array.isArray(concept.headline)
            ? concept.headline.map((s) => s.text).join(" ")
            : concept.headline,
          subhead: concept.subhead ?? "",
          cta: concept.cta ?? "",
        },
        product_service: null,
        offer: null,
        is_favorite: false,
        metadata: {
          pipeline: "v2",
          layout_slug: result.layoutSlug,
          photo_source: concept.photoSource,
          composited: true,
          batch_item_index: idx,
          rendered_at: result.renderedAt,
        },
      });
      if (insertError) {
        throw new Error(`Row insert failed: ${insertError.message}`);
      }

      completedCount++;
    } catch (err) {
      failedCount++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[v2-orchestrate] concept ${idx} failed (batch ${batchId}): ${msg}`,
      );
    }

    await admin
      .from("ad_generation_batches")
      .update({
        completed_count: completedCount,
        failed_count: failedCount,
      })
      .eq("id", batchId)
      .then(({ error: updateErr }) => {
        if (updateErr) {
          console.error("[v2-orchestrate] progress update failed:", updateErr.message);
        }
      });
  });

  if ((await fetchBatchStatus(batchId)) === "cancelled") {
    await admin
      .from("ad_generation_batches")
      .update({
        completed_count: completedCount,
        failed_count: failedCount,
        completed_at: new Date().toISOString(),
      })
      .eq("id", batchId);
    console.warn(
      `[v2-orchestrate] batch ${batchId}: cancelled mid-run (completed=${completedCount}, failed=${failedCount})`,
    );
    return;
  }

  const finalStatus =
    failedCount === 0 ? "completed" : completedCount === 0 ? "failed" : "partial";

  await admin
    .from("ad_generation_batches")
    .update({
      status: finalStatus,
      completed_count: completedCount,
      failed_count: failedCount,
      completed_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  console.log(
    `[v2-orchestrate] batch ${batchId} done: status=${finalStatus} completed=${completedCount} failed=${failedCount}`,
  );
}

// ---------------------------------------------------------------------------
// Simple semaphore concurrency — matches v1's pattern so we don't introduce
// a new dependency.
// ---------------------------------------------------------------------------
async function runWithConcurrency<T>(
  items: T[],
  maxConcurrent: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let active = 0;
  let idx = 0;
  let settled = 0;

  return new Promise<void>((resolve) => {
    function next() {
      while (active < maxConcurrent && idx < items.length) {
        const currentIdx = idx++;
        active++;
        fn(items[currentIdx], currentIdx)
          .catch((err) => {
            console.error("[v2-orchestrate] unexpected error:", err);
          })
          .finally(() => {
            active--;
            settled++;
            if (settled === items.length) resolve();
            else next();
          });
      }
    }
    next();
  });
}
