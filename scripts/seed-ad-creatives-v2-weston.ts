// ---------------------------------------------------------------------------
// Seed script — activate Ad Creatives v2 for Weston Funding
// ---------------------------------------------------------------------------
//
// One-off bootstrapper. Run AFTER migration 110 is applied. Idempotent —
// safe to re-run; rows upsert on their unique keys.
//
// What this does:
//   1. Verifies the Weston Funding client row exists (slug='weston-funding'
//      or name like '%Weston Funding%')
//   2. Seeds brand_ad_templates with 3 starter layouts for Weston
//   3. Does NOT seed brand_fonts (Playfair + Montserrat are packaged fonts,
//      registered at startup — Weston doesn't need client-uploaded custom
//      fonts for v1)
//   4. Does NOT generate scene photos here (use the
//      /api/ad-creatives-v2/generate-scene endpoint for that)
//
// Usage:
//   npx tsx scripts/seed-ad-creatives-v2-weston.ts
//
// Requires SUPABASE_DB_URL, NEXT_PUBLIC_SUPABASE_URL, and
// SUPABASE_SERVICE_ROLE_KEY in .env.local.

import { createClient } from "@supabase/supabase-js";

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const admin = createClient(url, key);

  // 1. Resolve Weston client id
  const { data: client, error: clientError } = await admin
    .from("clients")
    .select("id, name")
    .or("slug.eq.weston-funding,name.ilike.%Weston Funding%")
    .limit(1)
    .maybeSingle();

  if (clientError || !client) {
    console.error(
      `[seed] Weston Funding client not found. Create a client row with slug 'weston-funding' or name like 'Weston Funding' first. ${clientError?.message ?? ""}`,
    );
    process.exit(1);
  }

  const clientId = client.id as string;
  console.log(`[seed] Weston client resolved: ${client.name} (${clientId})`);

  // 2. Seed brand_ad_templates
  const templates = [
    {
      client_id: clientId,
      layout_slug: "weston-navy-editorial",
      display_name: "Navy Editorial — Serif Hero",
      is_active: true,
    },
    {
      client_id: clientId,
      layout_slug: "weston-stat-hero",
      display_name: "Stat Hero — Massive Gold Number",
      is_active: true,
    },
    {
      client_id: clientId,
      layout_slug: "weston-photo-hero-bottom",
      display_name: "Photo Hero — Bottom Navy Gradient",
      is_active: true,
    },
  ];

  for (const t of templates) {
    const { error } = await admin
      .from("brand_ad_templates")
      .upsert(t, { onConflict: "client_id,layout_slug" });
    if (error) {
      console.error(`[seed]   \u2717 ${t.layout_slug}: ${error.message}`);
    } else {
      console.log(`[seed]   \u2713 ${t.layout_slug}`);
    }
  }

  // 3. Sanity-check brand_dna exists with palette + logos
  const { data: dna } = await admin
    .from("brand_dna")
    .select("id, colors, logos")
    .eq("client_id", clientId)
    .maybeSingle();

  if (!dna) {
    console.warn(
      `[seed] \u26a0 No brand_dna row for Weston. Render will use neutral palette and no logos until brand_dna is populated.`,
    );
  } else {
    const colors = (dna.colors ?? []) as Array<{ role?: string; hex?: string }>;
    const logos = (dna.logos ?? []) as Array<{ colorway?: string; storage_path?: string }>;
    console.log(
      `[seed] brand_dna found: ${colors.length} colors, ${logos.length} logos.`,
    );
    if (!logos.find((l) => l.colorway === "white-full")) {
      console.warn(
        `[seed] \u26a0 No logo with colorway 'white-full' — photo-hero layouts require it. Add it to brand_dna.logos.`,
      );
    }
  }

  console.log("[seed] done");
}

main().catch((err) => {
  console.error("[seed] fatal:", err);
  process.exit(1);
});
