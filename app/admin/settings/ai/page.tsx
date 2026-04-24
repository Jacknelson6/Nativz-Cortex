import { redirect } from 'next/navigation';

/**
 * Legacy redirect — /admin/settings/ai was promoted to /admin/settings on
 * 2026-04-24 (personal account settings moved to /admin/account). Keeps
 * bookmarks working. Safe to delete after ~30 days.
 */
export default async function SettingsAiLegacyRedirect({
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
  redirect(query ? `/admin/settings?${query}` : '/admin/settings');
}
