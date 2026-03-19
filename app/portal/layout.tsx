import { headers } from 'next/headers';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { unstable_cache } from 'next/cache';
import { PortalSidebar } from '@/components/layout/portal-sidebar';
import { PortalHeader } from '@/components/layout/portal-header';
import { SidebarProvider, SidebarInset } from '@/components/layout/sidebar';
import { ImpersonationBanner } from '@/components/portal/impersonation-banner';
import { BrandModeProvider } from '@/components/layout/brand-mode-provider';
import type { FeatureFlags } from '@/lib/portal/get-portal-client';

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
      .select('full_name, avatar_url, organization_id')
      .eq('id', userId)
      .single();
    if (!userData) return null;

    let featureFlags: FeatureFlags = {
      can_search: true,
      can_view_reports: true,
      can_edit_preferences: true,
      can_submit_ideas: true,
      can_view_notifications: true,
      can_view_calendar: false,
      can_view_analyze: false,
      can_view_knowledge: true,
      can_use_nerd: false,
    };

    if (userData.organization_id) {
      const { data: clients } = await adminClient
        .from('clients')
        .select('feature_flags, agency')
        .eq('organization_id', userData.organization_id)
        .eq('is_active', true)
        .limit(1);

      if (clients?.[0]?.feature_flags) {
        featureFlags = { ...featureFlags, ...(clients[0].feature_flags as FeatureFlags) };
      }

      const agency = (clients?.[0]?.agency as string | null) ?? null;

      return {
        fullName: userData.full_name as string | null,
        avatarUrl: userData.avatar_url as string | null,
        featureFlags,
        agency,
      };
    }

    return {
      fullName: userData.full_name as string | null,
      avatarUrl: userData.avatar_url as string | null,
      featureFlags,
      agency: null,
    };
  },
  ['portal-layout-user'],
  { revalidate: 300 },
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

  // Determine active brand from cookie
  const cookieStore = await cookies();
  const activeClientCookie = cookieStore.get('x-portal-active-client')?.value;

  let activeBrand = brands.find((b) => b.id === activeClientCookie);
  if (!activeBrand && brands.length > 0) {
    activeBrand = brands[0];
  }

  const activeClient = clients?.find((c) => c.id === activeBrand?.id);
  const defaultFlags: FeatureFlags = {
    can_search: true,
    can_view_reports: true,
    can_edit_preferences: true,
    can_submit_ideas: true,
    can_view_notifications: true,
    can_view_calendar: false,
    can_view_analyze: false,
    can_view_knowledge: true,
    can_use_nerd: false,
  };

  const activeFeatureFlags = activeClient
    ? { ...defaultFlags, ...(activeClient.feature_flags as Partial<FeatureFlags> ?? {}) }
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
  const isAuthPage = pathname.includes('/portal/login') || pathname.includes('/portal/join');

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Auth pages: render without sidebar
  if (isAuthPage || !user) {
    return (
      <div className="min-h-screen bg-background">
        {children}
      </div>
    );
  }

  // Fetch user profile + accessible brands in parallel
  const [cached, brandData] = await Promise.all([
    getCachedPortalUser(user.id),
    getPortalBrands(user.id),
  ]);

  const userName = cached?.fullName || user.email || '';
  const avatarUrl = cached?.avatarUrl || null;

  // Feature flags: prefer active brand's flags (multi-brand), fall back to cached user flags
  let featureFlags: FeatureFlags = {
    can_search: true,
    can_view_reports: true,
    can_edit_preferences: true,
    can_submit_ideas: true,
    can_view_notifications: true,
    can_view_calendar: false,
    can_view_analyze: false,
    can_view_knowledge: true,
    can_use_nerd: false,
  };

  if (brandData.activeFeatureFlags) {
    featureFlags = brandData.activeFeatureFlags;
  } else if (cached?.featureFlags) {
    featureFlags = cached.featureFlags;
  }

  // Lock brand mode based on active brand's agency
  const activeAgency = brandData.activeAgency ?? cached?.agency ?? null;
  const forcedBrandMode = activeAgency === 'Anderson Collaborative' ? 'anderson' as const : 'nativz' as const;

  return (
    <BrandModeProvider forcedMode={forcedBrandMode}>
      <ImpersonationBanner />
      <SidebarProvider>
        <PortalSidebar
          userName={userName}
          avatarUrl={avatarUrl}
          featureFlags={featureFlags}
          brands={brandData.brands}
          activeBrandId={brandData.activeBrandId}
        />
        <SidebarInset>
          <PortalHeader />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </BrandModeProvider>
  );
}
