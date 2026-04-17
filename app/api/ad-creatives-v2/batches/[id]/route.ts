import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * GET /api/ad-creatives-v2/batches/[id]
 *
 * Returns batch status + progress + list of rendered creatives.
 * Admin-only. Used by polling UIs to wait for batch completion.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const resolvedParams = await params;
  const parsed = paramsSchema.safeParse(resolvedParams);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: batch } = await admin
    .from("ad_generation_batches")
    .select("id, client_id, status, total_count, completed_count, failed_count, created_at, completed_at")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  const { data: creatives } = await admin
    .from("ad_creatives")
    .select("id, image_url, aspect_ratio, metadata, is_favorite, created_at")
    .eq("batch_id", parsed.data.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    batch,
    creatives: creatives ?? [],
  });
}

/**
 * POST /api/ad-creatives-v2/batches/[id] (body: { action: 'cancel' })
 *
 * Cancels a running batch. The orchestrator checks status before every
 * work item and halts gracefully.
 */
const actionSchema = z.object({ action: z.literal("cancel") });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const resolvedParams = await params;
  const parsedParams = paramsSchema.safeParse(resolvedParams);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body (expected { action: 'cancel' })" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: updated, error } = await admin
    .from("ad_generation_batches")
    .update({ status: "cancelled" })
    .eq("id", parsedParams.data.id)
    .in("status", ["queued", "generating"])
    .select("id, status")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Cancel failed: ${error.message}` },
      { status: 500 },
    );
  }
  if (!updated) {
    return NextResponse.json(
      { error: "Batch not cancellable (already completed, failed, or not found)" },
      { status: 409 },
    );
  }

  return NextResponse.json({ batchId: updated.id, status: updated.status });
}
