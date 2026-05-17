import { Archive } from 'lucide-react';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';
import { InfoBrandAssetsCard } from '@/components/clients/settings/info-brand-assets-card';

export const dynamic = 'force-dynamic';

export default async function ProfileAssetsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <>
      <SettingsPageHeader
        icon={Archive}
        title="Assets"
        subtitle="Logos, footage, guidelines, fonts, reference photos. Files the editor pulls from on every project."
      />
      <InfoBrandAssetsCard slug={slug} />
    </>
  );
}
