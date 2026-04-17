import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimitByUser } from "@/lib/security/rate-limit";
import { runV2Batch } from "@/lib/ad-creatives-v2/orchestrate-batch";

export const maxDuration = 60;

const headlineSpanSchema = z.object({
  text: z.string().min(1),
  italic: z.boolean().optional(),
  color: z.string().optional(),
  newline: z.boolean().optional(),
});

const conceptSchema = z.object({
  clientId: z.string().uuid(),
  layoutSlug: z.string().min(1),
  aspect: z.enum(["1:1", "4:5", "9:16"]).default("1:1"),
  headline: z.union([z.string().min(1), z.array(headlineSpanSchema).min(1)]),
  subhead: z.string().optional(),
  eyebrow: z.string().optional(),
  cta: z.string().optional(),
  photoSource: z.enum(["product", "scene", "none"]).default("none"),
  photoStoragePath: z.string().optional(),
  logoColorway: z.string().min(1),
  background: z.string().optional(),
});

const bodySchema = z.object({
  clientId: z.string().uuid(),
  label: z.string().min(1).max(200).optional(),
  concepts: z.array(conceptSchema).min(1).max(200),
});

/**
 * POST /api/ad-creatives-v2/batches
 *
 * Creates an ad_generation_batches row with the concept array stashed in
 * config.v2_concepts, then runs the v2 orchestrator in the background
 * via after(). Returns the batch row immediately.
 *
 * @auth Required (admin)
 */
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitByUser(user.id, "/api/ad-creatives-v2/batches", "regular");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data: teamRow } = await supabase
    .from("team_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  const isAdmin =
    (teamRow?.role as string | undefined) === "admin" ||
    (teamRow?.role as string | undefined) === "owner";
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }

  const { clientId, label, concepts } = parsed.data;

  // Sanity-check every concept belongs to the same client
  for (const c of concepts) {
    if (c.clientId !== clientId) {
      return NextResponse.json(
        {
          error: "All concepts must have the same clientId as the batch",
          offending: c,
        },
        { status: 400 },
      );
    }
  }

  const admin = createAdminClient();

  const { data: batch, error: batchErr } = await admin
    .from("ad_generation_batches")
    .insert({
      client_id: clientId,
      status: "queued",
      total_count: concepts.length,
      completed_count: 0,
      failed_count: 0,
      config: {
        v2_label: label ?? `v2 batch (${new Date().toISOString()})`,
        v2_concepts: concepts,
      },
      created_by: user.id,
    })
    .select("id, client_id, status, total_count, created_at")
    .single();

  if (batchErr || !batch) {
    console.error("[ad-creatives-v2/batches] create failed:", batchErr);
    return NextResponse.json(
      { error: `Failed to create v2 batch: ${batchErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  after(async () => {
    try {
      await runV2Batch(batch.id as string);
    } catch (err) {
      console.error("[ad-creatives-v2/batches] background run failed:", err);
      await admin
        .from("ad_generation_batches")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", batch.id as string);
    }
  });

  return NextResponse.json(
    {
      batchId: batch.id,
      clientId: batch.client_id,
      status: batch.status,
      totalCount: batch.total_count,
      createdAt: batch.created_at,
    },
    { status: 202 },
  );
}
