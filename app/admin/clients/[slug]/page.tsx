import { ClientProfilePageClient } from '@/components/clients/client-profile-page-client';

export default async function AdminClientOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ClientProfilePageClient slug={slug} />;
}
