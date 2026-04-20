import { BrandSettingsForm } from '@/components/clients/settings/brand-settings-form';

export default async function ClientSettingsBrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <BrandSettingsForm slug={slug} />;
}
