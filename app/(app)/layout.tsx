import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** Avoid static prerender during `next build` when Preview env omits Supabase vars. */
export const dynamic = 'force-dynamic';

import { AdminSidebar } from '@/components/layout/admin-sidebar';
import { AdminTopBar } from '@/components/layout/admin-top-bar';
import { SidebarProvider, SidebarInset } from '@/components/layout/sidebar';
import { EasterEgg } from '@/components/easter-egg';
import { CommandPalette } from '@/components/shared/command-palette';
import { PageTransition } from '@/components/shared/page-transition';
import { BackgroundSearchProvider } from '@/components/search/background-search-tracker';
import { SWRProvider } from '@/components/providers/swr-provider';
import { BannerStrip } from '@/components/shared/banner-strip';
import { ImpersonationBanner } from '@/components/portal/impersonation-banner';
import { ActiveBrandProvider } from '@/lib/admin/active-client-context';
import { getActiveAdminClient, listAdminAccessibleBrands } from '@/lib/admin/get-active-client';

// Route group shell for brand-scoped tools lifted out of /admin/* (Trend
// Finder, Strategy Lab, Spying, Ads, Brain, Notes, Brand Profile). Shares
// the admin sidebar / top bar / brand switcher. Phase 1 of the brand-root
// migration: admin-only, to keep the auth posture identical to the old
// /admin/<tool> layout. Phase 2 relaxes this to "any logged-in user".

async function resolveAuthUser() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    return { user, ok: true as const };
  } catch (err) {
    console.error('(app) layout auth bootstrap failed:', err);
    return { user: null, ok: false as const };
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, ok } = await resolveAuthUser();

  if (!ok || !user) redirect('/login');

  const adminClient = createAdminClient();
  const [userRowRes, active, availableBrands] = await Promise.all([
    adminClient
      .from('users')
      .select('full_name, avatar_url, hidden_sidebar_items, role, is_super_admin')
      .eq('id', user.id)
      .single(),
    getActiveAdminClient().catch(() => ({
      brand: null,
      source: 'none' as const,
      isAdmin: false,
    })),
    listAdminAccessibleBrands().catch(() => []),
  ]);

  const userRow = userRowRes.data;
  const role = userRow?.role ?? null;
  const isAdmin =
    userRow?.is_super_admin === true || role === 'admin' || role === 'super_admin';

  if (!isAdmin) redirect('/portal');

  const userName = userRow?.full_name || user.email || '';
  const avatarUrl = userRow?.avatar_url || null;
  const hiddenSidebarItems =
    (userRow?.hidden_sidebar_items as string[] | null) ?? [];

  return (
    <SWRProvider>
      <BackgroundSearchProvider>
        <ActiveBrandProvider initialBrand={active.brand} availableBrands={availableBrands}>
          <SidebarProvider
            topBar={
              <AdminTopBar
                userName={userName}
                avatarUrl={avatarUrl}
                settingsHref="/admin/settings"
                apiDocsHref="/admin/nerd/api"
                logoutRedirect="/login"
              />
            }
          >
            <ImpersonationBanner />
            <EasterEgg />
            <CommandPalette />
            <AdminSidebar userName={userName} avatarUrl={avatarUrl} hiddenSidebarItems={hiddenSidebarItems} />
            <SidebarInset>
              <BannerStrip />
              <PageTransition>{children}</PageTransition>
            </SidebarInset>
          </SidebarProvider>
        </ActiveBrandProvider>
      </BackgroundSearchProvider>
    </SWRProvider>
  );
}
