import { redirect } from 'next/navigation';

export default async function SocialAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  const params = new URLSearchParams();
  if (clientId) params.set('clientId', clientId);
  params.set('tab', 'social');
  redirect(`/admin/analytics?${params.toString()}`);
}
