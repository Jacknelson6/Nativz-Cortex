import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { unstable_cache } from 'next/cache';

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

const getCachedUser = unstable_cache(
  async (userId: string) => {
    const adminClient = createAdminClient();
    const { data } = await adminClient
      .from('users')
      .select('full_name, avatar_url')
      .eq('id', userId)
      .single();
    return data;
  },
  ['admin-layout-user'],
  { revalidate: 300 },
);

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

    let userName = '';
    let avatarUrl: string | null = null;
    try {
      const userData = await getCachedUser(user.id);
      userName = userData?.full_name || user.email || '';
      avatarUrl = userData?.avatar_url || null;
    } catch {
      userName = user.email || '';
      avatarUrl = null;
    }

    // Read sidebar preferences uncached — the 5-min cache on `getCachedUser`
    // would mask toggle changes until it expires.
    let hiddenSidebarItems: string[] = [];
    try {
      const adminClient = createAdminClient();
      const { data: prefs } = await adminClient
        .from('users')
        .select('hidden_sidebar_items')
        .eq('id', user.id)
        .single();
      hiddenSidebarItems = (prefs?.hidden_sidebar_items as string[] | null) ?? [];
    } catch { /* silent — ship without filtering */ }

    // Resolve the admin's working brand + accessible brand list in parallel
    // so the top-bar pill can render its popover without a post-mount fetch.
    // Both queries are independent; Promise.all keeps this off a waterfall.
    // Roster failure degrades gracefully — an empty list just renders the
    // pill in its "select a brand" state rather than crashing the shell.
    const [active, availableBrands] = await Promise.all([
      getActiveAdminClient().catch(() => ({
        brand: null,
        source: 'none' as const,
        isAdmin: false,
      })),
      listAdminAccessibleBrands().catch(() => []),
    ]);

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
