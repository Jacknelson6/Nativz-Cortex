import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rateLimitByUser } from "@/lib/security/rate-limit";
import { composeV2 } from "@/lib/ad-creatives-v2/compose";
import type { ConceptSpec } from "@/lib/ad-creatives-v2/types";

export const maxDuration = 60;

const headlineSpanSchema = z.object({
  text: z.string().min(1),
  italic: z.boolean().optional(),
  color: z.string().optional(),
  newline: z.boolean().optional(),
});

const bodySchema = z.object({
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

/**
 * POST /api/ad-creatives-v2/render
 *
 * Renders a single concept via the v2 compositor-first pipeline and
 * returns the PNG buffer directly. Intended for admin preview + ad-hoc
 * rendering; batch orchestration lives in a separate route (Slice 2).
 *
 * @auth Required (admin)
 * @body ConceptSpec — see lib/ad-creatives-v2/types.ts
 * @returns PNG binary (image/png)
 */
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitByUser(user.id, "/api/ad-creatives-v2/render", "regular");
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

  // Admin-only gate: verify caller has admin role via team_members (same
  // pattern as existing ad-creatives routes)
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

  try {
    const concept = parsed.data as ConceptSpec;
    const result = await composeV2(concept);
    return new NextResponse(result.pngBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(result.pngBuffer.length),
        "X-V2-Layout": result.layoutSlug,
        "X-V2-Rendered-At": result.renderedAt,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ad-creatives-v2/render] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
