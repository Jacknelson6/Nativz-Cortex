import { redirect } from 'next/navigation';

/**
 * Portal login redirects to the unified Cortex login at /login. Phase 2 of
 * the brand-root migration: one entry point for both admins and viewers;
 * /login detects role after auth and routes accordingly.
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
  redirect(`/login${query ? `?${query}` : ''}`);
}
