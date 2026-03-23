import { ClientNotificationsSubpage } from '@/components/clients/client-notifications-subpage';

export default async function ClientSettingsNotificationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ClientNotificationsSubpage slug={slug} />;
}
