import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PortfolioClient, ConnectionStatus } from '@/components/ui/client-portfolio-selector';
import { SelectBrandClient } from './select-brand-client';

export const dynamic = 'force-dynamic';

/**
 * The brand picker. Clicking the top-bar pill lands here — a full-page grid
 * of every admin-visible client with social-connection status dots. Picking
 * writes the `x-admin-active-client` cookie and sends the user back to
 * wherever they came from (`?returnTo=...`).
 *
 * Keeping the roster query on this page (rather than in the admin layout)
 * means every admin request doesn't pay the `clients` + `social_profiles`
 * lookup cost for a list the user may never look at.
 */
export default async function SelectBrandPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin =
    me?.is_super_admin === true || me?.role === 'admin' || me?.role === 'super_admin';
  if (!isAdmin) redirect('/admin/dashboard');

  const [{ data: rawClients }, { data: profiles }, { returnTo }] = await Promise.all([
    admin
      .from('clients')
      .select('id, name, slug, logo_url, agency')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    admin.from('social_profiles').select('client_id, status'),
    searchParams,
  ]);

  // Build the connection-status map so the portfolio grid can render the
  // colored dot on each tile. Match the analytics landing's rules.
  const connectionMap: Record<string, ConnectionStatus> = {};
  for (const p of profiles ?? []) {
    if (!p.client_id) continue;
    const current = connectionMap[p.client_id];
    if (p.status === 'active' || p.status === 'connected') {
      connectionMap[p.client_id] = 'connected';
    } else if (!current) {
      connectionMap[p.client_id] = p.status === 'paused' ? 'paused' : 'disconnected';
    }
  }

  const clients: PortfolioClient[] = (rawClients ?? []).map((c) => ({
    id: c.id,
    name: c.name ?? c.slug ?? 'Untitled brand',
    slug: c.slug,
    logo_url: c.logo_url,
    agency: c.agency,
    connectionStatus: (connectionMap[c.id] ?? 'disconnected') as ConnectionStatus,
  }));

  const safeReturnTo = resolveSafeReturnTo(returnTo);

  return (
    <div className="cortex-page-gutter py-8">
      <SelectBrandClient clients={clients} returnTo={safeReturnTo} />
    </div>
  );
}

/**
 * Only honor `returnTo` values that live inside the admin shell. Prevents
 * an attacker from crafting a link that bounces the pill selector into an
 * external redirect.
 */
function resolveSafeReturnTo(raw: string | undefined): string {
  const FALLBACK = '/admin/dashboard';
  if (!raw) return FALLBACK;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/admin/')) return FALLBACK;
  if (trimmed.startsWith('/admin/select-brand')) return FALLBACK;
  // Block protocol-relative `//evil.com` payloads.
  if (trimmed.startsWith('//')) return FALLBACK;
  return trimmed;
}
