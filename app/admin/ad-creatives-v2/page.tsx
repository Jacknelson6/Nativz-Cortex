import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Ad Creatives v2 — client picker landing.
 *
 * Lists clients that have at least one row in brand_ad_templates (i.e. have
 * been activated for v2). Clicking through opens the per-client console.
 */
export default async function AdCreativesV2Landing() {
  const admin = createAdminClient();

  const { data: templateRows } = await admin
    .from("brand_ad_templates")
    .select("client_id")
    .eq("is_active", true);

  const activeClientIds = Array.from(
    new Set((templateRows ?? []).map((r) => r.client_id as string)),
  );

  let clients: Array<{ id: string; name: string; slug: string }> = [];
  if (activeClientIds.length > 0) {
    const { data } = await admin
      .from("clients")
      .select("id, name, slug")
      .in("id", activeClientIds)
      .order("name", { ascending: true });
    clients = (data ?? []) as Array<{ id: string; name: string; slug: string }>;
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Ad Creatives v2</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Compositor-first ad generation. Real logos + real typography + real
          product photos, composited on top of Gemini-generated scenes. See{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            morning-ads/CORTEX-MIGRATION-PRD.md
          </code>{" "}
          for rationale.
        </p>
      </header>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-lg font-medium">Activated clients</h2>
        {clients.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No clients have been activated for v2 yet. Run{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              npx tsx scripts/seed-ad-creatives-v2-weston.ts
            </code>{" "}
            to activate the pilot client (Weston Funding).
          </p>
        ) : (
          <ul className="divide-y">
            {clients.map((client) => (
              <li key={client.id}>
                <Link
                  href={`/admin/ad-creatives-v2/${client.id}`}
                  className="flex items-center justify-between py-3 hover:bg-muted/30"
                >
                  <span>
                    <span className="font-medium">{client.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      /{client.slug}
                    </span>
                  </span>
                  <span className="text-sm text-muted-foreground">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
