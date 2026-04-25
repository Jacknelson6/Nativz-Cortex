import { redirect } from 'next/navigation';
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
import { ImpersonationBanner } from '@/components/portal/impersonation-banner';
import { ActiveBrandProvider } from '@/lib/admin/active-client-context';
import { getActiveBrand, listAdminAccessibleBrands } from '@/lib/active-brand';
import { OnboardingFlowToasts } from '@/components/onboarding/onboarding-flow-toasts';
import { getPendingFlowToastsForUser } from '@/lib/onboarding/flows';

function bareShell(children: React.ReactNode) {
  return (
    <SWRProvider>
      <PageTransition>{children}</PageTransition>
    </SWRProvider>
  );
}

// Scoped to supabase client bootstrap so redirect() thrown later is never swallowed.
async function resolveAuthUser() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    return { user, ok: true as const };
  } catch (err) {
    console.error('AdminLayout auth bootstrap failed:', err);
    return { user: null, ok: false as const };
  }
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, ok } = await resolveAuthUser();

  // Login + any unauth / degraded render must not mount sidebar / header or hit admin DB cache.
  if (!ok || !user) return bareShell(children);

  // One users-table read covers every field the shell + role gate need. We
  // run it in parallel with brand resolution so the shell renders as soon
  // as the slowest of the three settles.
  const adminClient = createAdminClient();
  const [userRowRes, active, availableBrands, pendingFlowToasts] = await Promise.all([
    adminClient
      .from('users')
      .select('full_name, avatar_url, hidden_sidebar_items, role, is_super_admin')
      .eq('id', user.id)
      .single(),
    getActiveBrand().catch(() => ({
      brand: null,
      source: 'none' as const,
      isAdmin: false,
    })),
    listAdminAccessibleBrands().catch(() => []),
    getPendingFlowToastsForUser(user.id, adminClient).catch(() => []),
  ]);

  const userRow = userRowRes.data;
  const role = userRow?.role ?? null;
  const isAdmin =
    userRow?.is_super_admin === true || role === 'admin' || role === 'super_admin';

  // Phase 1 of the brand-root migration: any non-admin hitting /admin/* bounces
  // to the portal. Phase 2 unifies this behind a single /login → / entry point.
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
            <OnboardingFlowToasts initial={pendingFlowToasts} />
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
