import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { unstable_cache } from 'next/cache';
import { PortalSidebar, PortalNavItems } from '@/components/layout/portal-sidebar';
import { Header } from '@/components/layout/header';
import { SidebarProvider } from '@/components/layout/sidebar-provider';
import { MobileSidebar } from '@/components/layout/mobile-sidebar';
import type { FeatureFlags } from '@/lib/portal/get-portal-client';

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
      can_edit_preferences: false,
      can_submit_ideas: false,
    };

    if (userData.organization_id) {
      const { data: clients } = await adminClient
        .from('clients')
        .select('feature_flags')
        .eq('organization_id', userData.organization_id)
        .eq('is_active', true)
        .limit(1);

      if (clients?.[0]?.feature_flags) {
        featureFlags = { ...featureFlags, ...(clients[0].feature_flags as FeatureFlags) };
      }
    }

    return {
      fullName: userData.full_name as string | null,
      avatarUrl: userData.avatar_url as string | null,
      featureFlags,
    };
  },
  ['portal-layout-user'],
  { revalidate: 300 }, // 5 minutes
);

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  let userName = '';
  let avatarUrl: string | null = null;
  let featureFlags: FeatureFlags = {
    can_search: true,
    can_view_reports: true,
    can_edit_preferences: false,
    can_submit_ideas: false,
  };

  if (user) {
    const cached = await getCachedPortalUser(user.id);
    userName = cached?.fullName || user.email || '';
    avatarUrl = cached?.avatarUrl || null;
    if (cached?.featureFlags) featureFlags = cached.featureFlags;
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen flex-col">
        <Header portalMode />
        <div className="flex flex-1 overflow-hidden">
          <PortalSidebar userName={userName} avatarUrl={avatarUrl} featureFlags={featureFlags} />
          <MobileSidebar>
            <PortalNavItems featureFlags={featureFlags} />
          </MobileSidebar>
          <main className="flex-1 overflow-y-auto bg-background">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
