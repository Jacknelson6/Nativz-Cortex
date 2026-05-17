import { redirect } from 'next/navigation';

export default async function ClientSettingsPartnershipRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/admin/clients/${slug}/profile/deliverables`);
}
