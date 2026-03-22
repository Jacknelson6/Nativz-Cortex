import { ClientSettingsSubpage } from '@/components/clients/client-settings-subpage';

export default async function AdminClientSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ClientSettingsSubpage slug={slug} />;
}
