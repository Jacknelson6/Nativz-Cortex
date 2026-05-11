// VFF-10: portal-side format detail (read-only).
// Same analysis as /admin/formats/[id] but stripped of save/pin/dismiss
// CTAs and gated to videos actually pinned within the viewer's org.
// Pin-membership check is the auth boundary: if the strategist team
// hasn't pinned this video for any client in the org, the viewer cannot
// see it via the portal even by guessing the URL.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFormatDetail } from '@/lib/analytics/format-detail';
import { FormatDetailPane } from '@/components/formats/format-detail-pane';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function PortalFormatDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const portal = await getPortalClient();
  if (!portal) redirect('/login');

  const admin = createAdminClient();

  // 1. Resolve the org's clients.
  const { data: clients } = await admin
    .from('clients')
    .select('id')
    .eq('organization_id', portal.organizationId);
  const clientIds = (clients ?? []).map((c) => (c as { id: string }).id);
  if (clientIds.length === 0) notFound();

  // 2. Find the "Pinned" collections for those clients.
  const { data: pinCollections } = await admin
    .from('viral_collections')
    .select('id')
    .in('client_id', clientIds)
    .eq('name', 'Pinned');
  const collectionIds = (pinCollections ?? []).map((c) => (c as { id: string }).id);
  if (collectionIds.length === 0) notFound();

  // 3. Is this video pinned by anyone in the org? If not, 404 — the
  //    viewer is not allowed to see arbitrary videos by URL.
  const { data: pinRow } = await admin
    .from('viral_collection_videos')
    .select('video_id')
    .in('collection_id', collectionIds)
    .eq('video_id', id)
    .limit(1)
    .maybeSingle();
  if (!pinRow) notFound();

  // 4. Load the full detail. brand_context is omitted (read-only); we
  //    pass null clientId so getFormatDetail won't derive
  //    saved/pinned/dismissed flags. The FormatDetailPane in readOnly
  //    mode never renders the action bar anyway.
  const data = await getFormatDetail(id, null, null);
  if (!data) notFound();

  return (
    <div className="space-y-4 p-6">
      <Link className="text-xs text-white/50 hover:text-white/80" href="/portal/research/formats">
        &larr; Back to formats
      </Link>
      <FormatDetailPane data={data} brand_name={portal.client.name} readOnly />
    </div>
  );
}
