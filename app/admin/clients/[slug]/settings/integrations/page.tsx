import { redirect } from 'next/navigation';

export default async function ClientSettingsIntegrationsRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/admin/clients/${slug}/profile/integrations`);
}
