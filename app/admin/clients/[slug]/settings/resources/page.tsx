import { ResourcesSettingsForm } from '@/components/clients/settings/resources-settings-form';

export default async function ClientSettingsResourcesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ResourcesSettingsForm slug={slug} />;
}
