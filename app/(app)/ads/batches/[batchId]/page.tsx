import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { V2BatchStatus } from "@/components/ad-creatives-v2/batch-status";

/**
 * Ad Creatives — batch detail. Flattened from
 * `/admin/ad-creatives-v2/[clientId]/batches/[batchId]` now that the URL
 * has no client segment. The batch row carries its own `client_id`, so
 * the old belt-and-suspenders `.eq('client_id', …)` filter isn't needed
 * to load the right record; we just look up by batch id.
 */
export default async function AdCreativesBatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const admin = createAdminClient();

  const { data: batch } = await admin
    .from("ad_generation_batches")
    .select("id, client_id, status, total_count, completed_count, failed_count, config, created_at, completed_at")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) notFound();

  const clientId = batch.client_id as string;

  const { data: creatives } = await admin
    .from("ad_creatives")
    .select("id, image_url, aspect_ratio, metadata, is_favorite, created_at")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });

  return (
    <div className="mx-auto max-w-6xl p-8 space-y-6">
      <header>
        <Link
          href="/ads"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Ad Creatives
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Batch{" "}
          <span className="font-mono text-base text-muted-foreground">
            {batchId.slice(0, 8)}
          </span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {(batch.config as { v2_label?: string })?.v2_label ?? "(unlabeled)"}
        </p>
      </header>

      <V2BatchStatus
        clientId={clientId}
        batchId={batchId}
        initialStatus={batch.status as string}
        initialTotal={(batch.total_count as number | null) ?? 0}
        initialCompleted={(batch.completed_count as number | null) ?? 0}
        initialFailed={(batch.failed_count as number | null) ?? 0}
      />

      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-lg font-medium">
          Creatives ({creatives?.length ?? 0})
        </h2>
        {!creatives || creatives.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No creatives rendered yet. Refresh this page after the orchestrator
            catches up.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {creatives.map((c) => (
              <a
                key={c.id as string}
                href={c.image_url as string}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded border bg-muted/20 p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.image_url as string}
                  alt="Ad creative"
                  className="w-full rounded"
                />
                <div className="mt-2 text-xs text-muted-foreground">
                  {(c.metadata as { layout_slug?: string })?.layout_slug ?? "—"}
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
