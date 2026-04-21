import { redirect } from 'next/navigation';
import { getActiveAdminClient } from '@/lib/admin/get-active-client';

export default async function SocialAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  const params = new URLSearchParams();

  // Fall back to the top-bar pill when no explicit ?clientId= is passed.
  // URL wins when present.
  let resolvedClientId = clientId?.trim();
  if (!resolvedClientId) {
    const active = await getActiveAdminClient().catch(() => null);
    if (active?.brand?.id) resolvedClientId = active.brand.id;
  }

  if (resolvedClientId) params.set('clientId', resolvedClientId);
  params.set('tab', 'social');
  redirect(`/admin/analytics?${params.toString()}`);
}
