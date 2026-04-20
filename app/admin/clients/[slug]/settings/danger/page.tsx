import { DangerSettingsView } from '@/components/clients/settings/danger-settings-view';

export default async function ClientSettingsDangerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <DangerSettingsView slug={slug} />;
}
