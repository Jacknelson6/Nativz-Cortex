import { redirect } from "next/navigation";

/**
 * Legacy batch detail path. The new location is
 * `/ads/batches/[batchId]` (no client segment — the batch
 * row carries its own client_id). Redirect preserves the batchId and
 * drops the legacy clientId from the URL.
 */
export default async function LegacyV2BatchRedirect({
  params,
}: {
  params: Promise<{ clientId: string; batchId: string }>;
}) {
  const { batchId } = await params;
  redirect(`/ads/batches/${batchId}`);
}
