import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminClientRootRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/admin/clients/${slug}/settings/brand`);
}
