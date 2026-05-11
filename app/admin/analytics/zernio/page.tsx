// Legacy URL shim. Zernio growth charts now live inside the main Analytics
// page as the Growth sub-tab, so every brand's overview / growth /
// benchmarking story sits behind one URL and one brand pill. Anyone
// hitting the old standalone path gets bounced into the unified view.

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ZernioAnalyticsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; range?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  qs.set('tab', 'social');
  qs.set('sub', 'growth');
  if (params.clientId) qs.set('clientId', params.clientId);
  if (params.range) qs.set('range', params.range);
  redirect(`/admin/analytics?${qs.toString()}`);
}
