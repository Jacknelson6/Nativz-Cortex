import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimitByUser } from "@/lib/security/rate-limit";
import { generateGeminiImage } from "@/lib/ad-creatives-v2/scenes/gemini-generate";

export const maxDuration = 180;

const bodySchema = z.object({
  clientId: z.string().uuid(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be lowercase kebab-case"),
  displayName: z.string().min(1).max(120),
  prompt: z.string().min(20).max(4000),
  tags: z.array(z.string().min(1).max(32)).max(20).optional(),
});

/**
 * POST /api/ad-creatives-v2/generate-scene
 *
 * Generates a single scene photo via Gemini, uploads it to
 * `brand-scene-photos`, and inserts a brand_scene_photos row. Idempotent
 * by (client_id, slug) — existing rows return 200 with `regenerated: true`.
 *
 * @auth Required (admin)
 */
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitByUser(user.id, "/api/ad-creatives-v2/generate-scene", "ai");
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

  const { clientId, slug, displayName, prompt, tags } = parsed.data;
  const admin = createAdminClient();

  try {
    const pngBuffer = await generateGeminiImage(prompt);

    const storagePath = `${clientId}/${slug}.png`;
    const { error: uploadError } = await admin.storage
      .from("brand-scene-photos")
      .upload(storagePath, pngBuffer, {
        contentType: "image/png",
        upsert: true,
      });
    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Upsert brand_scene_photos row
    const { data: existing } = await admin
      .from("brand_scene_photos")
      .select("id")
      .eq("client_id", clientId)
      .eq("slug", slug)
      .maybeSingle();

    if (existing?.id) {
      await admin
        .from("brand_scene_photos")
        .update({
          display_name: displayName,
          prompt,
          storage_path: storagePath,
          tags: tags ?? [],
          gemini_model: process.env.GEMINI_IMAGE_MODEL ?? null,
        })
        .eq("id", existing.id);
      return NextResponse.json({
        id: existing.id,
        regenerated: true,
        storagePath,
        bytes: pngBuffer.length,
      });
    }

    const { data: inserted, error: insertError } = await admin
      .from("brand_scene_photos")
      .insert({
        client_id: clientId,
        slug,
        display_name: displayName,
        prompt,
        storage_path: storagePath,
        tags: tags ?? [],
        gemini_model: process.env.GEMINI_IMAGE_MODEL ?? null,
      })
      .select("id")
      .single();
    if (insertError || !inserted) {
      throw new Error(`Row insert failed: ${insertError?.message ?? "no data"}`);
    }

    return NextResponse.json({
      id: inserted.id,
      regenerated: false,
      storagePath,
      bytes: pngBuffer.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ad-creatives-v2/generate-scene] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
