import { redirect } from 'next/navigation';

export default async function ClientSettingsContactsRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/admin/clients/${slug}/profile/users`);
}
