import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** Avoid static prerender during `next build` when Preview env omits Supabase vars. */
export const dynamic = 'force-dynamic';
import { AdminSidebar } from '@/components/layout/admin-sidebar';
// Admin shell structure: full-width top bar (agency logo + brand pill +
// global actions) spans above the sidebar + main content. The sidebar
// header is now empty for admins — logo + brand live in <AdminTopBar>.
// Portal still renders its own sidebar-embedded logo since the portal
// layout doesn't use the top bar.
import { AdminTopBar } from '@/components/layout/admin-top-bar';
import { SidebarProvider, SidebarInset } from '@/components/layout/sidebar';
import { EasterEgg } from '@/components/easter-egg';
import { CommandPalette } from '@/components/shared/command-palette';
import { PageTransition } from '@/components/shared/page-transition';
import { BackgroundSearchProvider } from '@/components/search/background-search-tracker';
import { SWRProvider } from '@/components/providers/swr-provider';
import { BannerStrip } from '@/components/shared/banner-strip';
import { ActiveBrandProvider } from '@/lib/admin/active-client-context';
import { getActiveAdminClient, listAdminAccessibleBrands } from '@/lib/admin/get-active-client';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Login (and any unauthenticated admin render) must not mount sidebar / header or hit admin DB cache.
    if (!user) {
      return (
        <SWRProvider>
          <PageTransition>{children}</PageTransition>
        </SWRProvider>
      );
    }

    // One users-table read covers all three fields the shell needs. The
    // previous split (cached full_name/avatar_url + uncached hidden_sidebar_items)
    // meant the first nav of every session hit the DB twice. Merging pulls
    // it down to a single query; we run it in parallel with brand resolution
    // so the shell renders as soon as the slowest of the three settles.
    const adminClient = createAdminClient();
    const [userRowRes, active, availableBrands] = await Promise.all([
      adminClient
        .from('users')
        .select('full_name, avatar_url, hidden_sidebar_items')
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
                  logoutRedirect="/admin/login"
                />
              }
            >
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
  } catch (err) {
    console.error('AdminLayout bootstrap failed:', err);
    // Degraded shell so /admin/login can still render if env/DB is misconfigured during local dev.
    return (
      <SWRProvider>
        <PageTransition>{children}</PageTransition>
      </SWRProvider>
    );
  }
}
