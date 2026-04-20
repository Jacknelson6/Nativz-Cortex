import { GeneralSettingsForm } from '@/components/clients/settings/general-settings-form';

export default async function ClientSettingsGeneralPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <GeneralSettingsForm slug={slug} />;
}
