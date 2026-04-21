import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { V2GenerateSceneForm } from "@/components/ad-creatives-v2/generate-scene-form";
import { V2RenderPreview } from "@/components/ad-creatives-v2/render-preview";
import { V2BatchCreator } from "@/components/ad-creatives-v2/batch-creator";
import { getActiveAdminClient } from "@/lib/admin/get-active-client";

/**
 * Ad Creatives — the compositor-first ad generation workspace. Real logos
 * + real typography + real product photos composited on top of
 * Gemini-generated scenes. (This was called "Ad Creatives v2" until the
 * NAT-57 URL flatten promoted it to be Ad Creatives, full stop.)
 *
 * URL is flat (no `[clientId]` segment). The session brand pill drives
 * which client's workspace renders; switching brands reshapes in place.
 * Legacy /admin/ad-creatives-v2/[clientId] routes still work via redirect
 * shims.
 */
export default async function AdCreativesPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const active = await getActiveAdminClient().catch(() => null);

  // No brand pinned → empty state.
  if (!active?.brand) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Ad Creatives</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick a brand in the top-bar pill to open its ad-creatives workspace.
          </p>
        </header>
        <section className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            No brand selected. Use the brand picker in the top bar — scenes,
            templates, and batches are scoped to the selected client.
          </p>
        </section>
      </div>
    );
  }

  const admin = createAdminClient();
  const clientId = active.brand.id;

  const [{ data: templates }, { data: scenes }, { data: recentBatches }] =
    await Promise.all([
      admin
        .from("brand_ad_templates")
        .select("id, layout_slug, display_name, is_active, overrides, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true }),
      admin
        .from("brand_scene_photos")
        .select("id, slug, display_name, storage_path, tags, gemini_model, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      admin
        .from("ad_generation_batches")
        .select("id, status, total_count, completed_count, failed_count, config, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const v2Batches = (recentBatches ?? []).filter((b) => {
    const cfg = b.config as { v2_concepts?: unknown } | null;
    return Array.isArray(cfg?.v2_concepts);
  });

  return (
    <div className="mx-auto max-w-6xl p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          {active.brand.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          /{active.brand.slug} · Ad Creatives
        </p>
      </header>

      {/* Templates */}
      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-lg font-medium">Templates</h2>
        {!templates || templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No templates registered for this client yet.
          </p>
        ) : (
          <ul className="divide-y">
            {templates.map((t) => (
              <li key={t.id as string} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-mono text-sm">{t.layout_slug as string}</span>
                  <span className="ml-3 text-sm text-muted-foreground">
                    {t.display_name as string}
                  </span>
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${t.is_active ? "bg-green-100 text-green-900" : "bg-muted text-muted-foreground"}`}
                >
                  {t.is_active ? "active" : "inactive"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Scenes */}
      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-lg font-medium">Scene Library</h2>
        {!scenes || scenes.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">
            No scenes generated yet. Use the form below to generate your first
            Gemini scene.
          </p>
        ) : (
          <ul className="mb-6 divide-y">
            {scenes.map((s) => (
              <li key={s.id as string} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-mono text-sm">{s.slug as string}</span>
                  <span className="ml-3 text-sm text-muted-foreground">
                    {s.display_name as string}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {(s.tags as string[] | null)?.join(", ") ?? ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <V2GenerateSceneForm clientId={clientId} />
      </section>

      {/* Live render preview */}
      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-lg font-medium">Render preview</h2>
        <V2RenderPreview
          clientId={clientId}
          templates={(templates ?? []).map((t) => ({
            id: t.id as string,
            layoutSlug: t.layout_slug as string,
            displayName: t.display_name as string,
          }))}
        />
      </section>

      {/* Batch creator */}
      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-lg font-medium">Create batch</h2>
        <V2BatchCreator clientId={clientId} />
      </section>

      {/* Recent batches */}
      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-lg font-medium">Recent batches</h2>
        {v2Batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No batches have been run for this client yet.
          </p>
        ) : (
          <ul className="divide-y">
            {v2Batches.map((b) => (
              <li key={b.id as string} className="py-2">
                <Link
                  href={`/admin/ad-creatives/batches/${b.id as string}`}
                  className="flex items-center justify-between hover:bg-muted/30"
                >
                  <span>
                    <span className="font-mono text-xs">
                      {(b.id as string).slice(0, 8)}
                    </span>
                    <span className="ml-3 text-sm text-muted-foreground">
                      {(b.config as { v2_label?: string })?.v2_label ?? "(unlabeled)"}
                    </span>
                  </span>
                  <span className="text-xs">
                    <span className="rounded bg-muted px-2 py-0.5">{b.status as string}</span>
                    <span className="ml-3 text-muted-foreground">
                      {(b.completed_count as number | null) ?? 0}/{(b.total_count as number | null) ?? 0}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
