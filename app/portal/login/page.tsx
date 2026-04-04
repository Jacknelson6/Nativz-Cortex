import { redirect } from 'next/navigation';

/**
 * Portal login redirects to the unified login page at /admin/login.
 * The login page detects the user's role after auth and redirects accordingly:
 * - admin → /admin/dashboard
 * - viewer → /portal/search/new
 */
export default async function PortalLoginRedirect({
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
  redirect(`/admin/login${query ? `?${query}` : ''}`);
}
