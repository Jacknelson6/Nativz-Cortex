import { redirect } from 'next/navigation';

/**
 * Client detail pages now live in the modal on /admin/clients.
 * This page redirects to the clients list with the modal auto-opened.
 */
export default async function ClientDetailRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/admin/clients?client=${slug}`);
}
