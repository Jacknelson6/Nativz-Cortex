import { redirect } from 'next/navigation';

export default async function PortalForgotPasswordRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, v);
  }
  const query = qs.toString();
  redirect(`/admin/forgot-password${query ? `?${query}` : ''}`);
}
