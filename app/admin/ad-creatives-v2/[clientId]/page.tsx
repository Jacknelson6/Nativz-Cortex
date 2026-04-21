import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { V2GenerateSceneForm } from "@/components/ad-creatives-v2/generate-scene-form";
import { V2RenderPreview } from "@/components/ad-creatives-v2/render-preview";
import { V2BatchCreator } from "@/components/ad-creatives-v2/batch-creator";
import { SyncActiveBrand } from "@/components/admin/sync-active-brand";

export default async function AdCreativesV2ClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const admin = createAdminClient();

  const { data: client } = await admin
    .from("clients")
    .select("id, name, slug")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) notFound();

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
      {/* Keep the top-bar pill in lockstep with the URL's clientId on
          direct-link visits. No-op when they already match. */}
      <SyncActiveBrand clientId={client.id} />
      <header>
        <Link
          href="/admin/ad-creatives-v2"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← All v2 clients
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {client.name as string}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          /{client.slug as string} · {clientId}
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
        <h2 className="mb-4 text-lg font-medium">Recent v2 batches</h2>
        {v2Batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No v2 batches have been run for this client yet.
          </p>
        ) : (
          <ul className="divide-y">
            {v2Batches.map((b) => (
              <li key={b.id as string} className="py-2">
                <Link
                  href={`/admin/ad-creatives-v2/${clientId}/batches/${b.id as string}`}
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
