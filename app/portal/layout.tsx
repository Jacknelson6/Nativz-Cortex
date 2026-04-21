import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { unstable_cache } from 'next/cache';
import { AdminSidebar } from '@/components/layout/admin-sidebar';
import { AdminHeader } from '@/components/layout/admin-header';
import { SidebarProvider, SidebarInset } from '@/components/layout/sidebar';
import { ImpersonationBanner } from '@/components/portal/impersonation-banner';
import { AdminInPortalGuard } from '@/components/portal/admin-in-portal-guard';
import { BrandModeProvider } from '@/components/layout/brand-mode-provider';
import { SWRProvider } from '@/components/providers/swr-provider';
import { BannerStrip } from '@/components/shared/banner-strip';
import type { FeatureFlags } from '@/lib/portal/get-portal-client';
import { buildPortalFeatureFlags } from '@/lib/portal/feature-flags';

interface PortalBrand {
  id: string;
  name: string;
  slug: string;
  agency: string | null;
  logo_url: string | null;
  organization_id: string;
}

const getCachedPortalUser = unstable_cache(
  async (userId: string) => {
    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('full_name, avatar_url, organization_id, role, is_owner')
      .eq('id', userId)
      .single();
    if (!userData) return null;

    let featureFlags: FeatureFlags = buildPortalFeatureFlags(null);

    if (userData.organization_id) {
      const { data: clients } = await adminClient
        .from('clients')
        .select('feature_flags, agency')
        .eq('organization_id', userData.organization_id)
        .eq('is_active', true)
        .limit(1);

      if (clients?.[0]) {
        featureFlags = buildPortalFeatureFlags(clients[0].feature_flags);
      }

      const agency = (clients?.[0]?.agency as string | null) ?? null;

      return {
        fullName: userData.full_name as string | null,
        avatarUrl: userData.avatar_url as string | null,
        featureFlags,
        agency,
        role: (userData.role as string | null) ?? null,
        isOwner: (userData.is_owner as boolean | null) ?? false,
      };
    }

    return {
      fullName: userData.full_name as string | null,
      avatarUrl: userData.avatar_url as string | null,
      featureFlags,
      agency: null,
      role: (userData.role as string | null) ?? null,
      isOwner: (userData.is_owner as boolean | null) ?? false,
    };
  },
  ['portal-layout-user'],
  { revalidate: 60 },
);

/**
 * Fetch accessible brands for the user (uncached — needs cookie context for active brand).
 * Also resolves the active brand's agency for theme locking.
 */
async function getPortalBrands(userId: string): Promise<{
  brands: PortalBrand[];
  activeBrandId: string | null;
  activeAgency: string | null;
  activeFeatureFlags: FeatureFlags | null;
}> {
  const adminClient = createAdminClient();

  // Impersonation wins. When an admin is impersonating, the sidebar
  // brand must match the banner / getPortalClient result — otherwise the
  // BrandSwitcher visually points at a different client than the one
  // actually serving data, which is what produced the "Viewing as
  // Avondale" / "data is Landshark's" bug.
  const cookieStore = await cookies();
  const impersonateOrgId = cookieStore.get('x-impersonate-org')?.value || null;
  const impersonateSlug = cookieStore.get('x-impersonate-slug')?.value?.trim() || null;

  if (impersonateOrgId) {
    const { data: userRow } = await adminClient
      .from('users')
      .select('role, is_super_admin')
      .eq('id', userId)
      .single();
    const realIsAdmin =
      userRow?.is_super_admin === true ||
      userRow?.role === 'admin' ||
      userRow?.role === 'super_admin';

    if (realIsAdmin) {
      let query = adminClient
        .from('clients')
        .select('id, name, slug, agency, logo_url, organization_id, feature_flags')
        .eq('organization_id', impersonateOrgId)
        .eq('is_active', true)
        .order('name');
      if (impersonateSlug) query = query.eq('slug', impersonateSlug);

      const { data: impersonatedClients } = await query;
      const clients = impersonatedClients ?? [];

      if (clients.length > 0) {
        const active = clients[0];
        const brands: PortalBrand[] = clients.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          agency: (c.agency as string | null) ?? null,
          logo_url: (c.logo_url as string | null) ?? null,
          organization_id: c.organization_id,
        }));
        return {
          brands,
          activeBrandId: active.id,
          activeAgency: (active.agency as string | null) ?? null,
          activeFeatureFlags: buildPortalFeatureFlags(active.feature_flags),
        };
      }
    }
  }

  const { data: accessRows } = await adminClient
    .from('user_client_access')
    .select('client_id, organization_id')
    .eq('user_id', userId);

  if (!accessRows || accessRows.length === 0) {
    return { brands: [], activeBrandId: null, activeAgency: null, activeFeatureFlags: null };
  }

  const clientIds = accessRows.map((r) => r.client_id);

  const { data: clients } = await adminClient
    .from('clients')
    .select('id, name, slug, agency, logo_url, organization_id, feature_flags')
    .in('id', clientIds)
    .eq('is_active', true)
    .order('name');

  const brands: PortalBrand[] = (clients ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    agency: (c.agency as string | null) ?? null,
    logo_url: (c.logo_url as string | null) ?? null,
    organization_id: c.organization_id,
  }));

  const activeClientCookie = cookieStore.get('x-portal-active-client')?.value;

  let activeBrand = brands.find((b) => b.id === activeClientCookie);
  if (!activeBrand && brands.length > 0) {
    activeBrand = brands[0];
  }

  const activeClient = clients?.find((c) => c.id === activeBrand?.id);

  const activeFeatureFlags = activeClient
    ? buildPortalFeatureFlags(activeClient.feature_flags)
    : null;

  return {
    brands,
    activeBrandId: activeBrand?.id ?? null,
    activeAgency: activeBrand?.agency ?? null,
    activeFeatureFlags,
  };
}

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Detect auth pages (login, join) — skip sidebar for unauthenticated pages
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') || headersList.get('x-invoke-path') || '';
  const isAuthPage =
    pathname.includes('/portal/login') ||
    pathname.includes('/portal/join') ||
    pathname.includes('/portal/forgot-password') ||
    pathname.includes('/portal/reset-password');

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Auth pages: render without sidebar
  if (isAuthPage) {
    return (
      <SWRProvider>
        <div className="min-h-screen bg-background">
          {children}
        </div>
      </SWRProvider>
    );
  }

  // Non-auth pages without a user session — redirect to unified login
  if (!user) {
    redirect('/admin/login');
  }

  // Fetch user profile + accessible brands in parallel
  const [cached, brandData] = await Promise.all([
    getCachedPortalUser(user.id),
    getPortalBrands(user.id),
  ]);

  const userName = cached?.fullName || user.email || '';
  const avatarUrl = cached?.avatarUrl || null;

  // Read sidebar preferences uncached so toggles apply on next page load.
  let hiddenSidebarItems: string[] = [];
  try {
    const adminClient = createAdminClient();
    const { data: prefs } = await adminClient
      .from('users')
      .select('hidden_sidebar_items')
      .eq('id', user.id)
      .single();
    hiddenSidebarItems = (prefs?.hidden_sidebar_items as string[] | null) ?? [];
  } catch { /* silent */ }

  // Lock brand mode: domain ALWAYS wins — Nativz domain = Nativz brand, AC domain = AC brand.
  // Never fall back to the client's agency field; a Nativz-domain user must never see AC branding.
  const domainAgency = headersList.get('x-agency') as 'anderson' | 'nativz' | null;
  const forcedBrandMode: 'anderson' | 'nativz' =
    domainAgency === 'anderson' ? 'anderson' : 'nativz';

  // Admin viewing portal gets a safety net — one-time modal + persistent
  // "back to admin" pill. Viewers see nothing.
  //
  // The Client View picker in the avatar popover is ALSO gated by this flag
  // (via AdminSidebar's `isAdmin` prop). The server-side /api/impersonate
  // endpoint requires `is_owner=true`, so we mirror that here to avoid
  // showing admins a button that will 403 on click.
  const isAdminInPortal = cached?.role === 'admin' && cached?.isOwner === true;

  return (
    <SWRProvider>
      <BrandModeProvider forcedMode={forcedBrandMode}>
        <ImpersonationBanner />
        <AdminInPortalGuard isAdmin={isAdminInPortal} />
        <SidebarProvider>
          <AdminSidebar
            userName={userName}
            avatarUrl={avatarUrl}
            role="viewer"
            routePrefix="/portal"
            logoutPath="/admin/login"
            settingsPath="/portal/settings"
            brands={brandData.brands}
            activeBrandId={brandData.activeBrandId}
            hiddenSidebarItems={hiddenSidebarItems}
            isAdmin={isAdminInPortal}
          />
          <SidebarInset>
            <AdminHeader />
            <BannerStrip />
            {children}
          </SidebarInset>
        </SidebarProvider>
      </BrandModeProvider>
    </SWRProvider>
  );
}
