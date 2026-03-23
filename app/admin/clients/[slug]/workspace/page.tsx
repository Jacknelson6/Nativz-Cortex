import { redirect } from 'next/navigation';

/** Legacy URL: workspace settings now live under Settings → General / Notifications. */
export default async function ClientWorkspaceRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/admin/clients/${slug}/settings`);
}
