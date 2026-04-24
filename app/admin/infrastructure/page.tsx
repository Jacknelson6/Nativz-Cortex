import { redirect } from 'next/navigation';

/**
 * Legacy redirect — /admin/infrastructure was renamed to /admin/usage on
 * 2026-04-24. Keeps bookmarks and old notification links working. Safe to
 * delete after ~30 days once the access log stops hitting it.
 */
export default async function InfrastructureLegacyRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') qs.set(k, v);
    else if (Array.isArray(v) && v[0]) qs.set(k, v[0]);
  }
  const query = qs.toString();
  redirect(query ? `/admin/usage?${query}` : '/admin/usage');
}
