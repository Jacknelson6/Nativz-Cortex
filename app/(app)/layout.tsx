import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
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
import { getActiveBrand, listAdminAccessibleBrands } from '@/lib/active-brand';
import { getActiveViewerBrand, listViewerAccessibleBrands } from '@/lib/portal/get-viewer-brands';

// Phase 2 of the brand-root migration: this shell now serves both admins
// and viewers. Admin role keeps the full sidebar (admin ops + brand tools);
// viewer role gets brand tools only — `AdminSidebar` filters items via
// `ADMIN_ONLY_HREFS` based on the `role` prop. The brand switcher resolves
// either against the admin's portfolio or the viewer's `user_client_access`
// list, with the same `<ActiveBrandProvider />` powering both.

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
  const { data: userRow } = await adminClient
    .from('users')
    .select('full_name, avatar_url, hidden_sidebar_items, role, is_super_admin')
    .eq('id', user.id)
    .single();

  const role = userRow?.role ?? null;
  const isSuperAdmin = userRow?.is_super_admin === true;
  const isAdmin = isSuperAdmin || role === 'admin' || role === 'super_admin';
  const isViewer = role === 'viewer';

  // Anything other than admin or viewer (deactivated, missing row) gets
  // bounced to /login — the maintenance gate already catches viewers in
  // production while phase 2 ships, but the (app) shell still wants a
  // clean fall-through for the un-classifiable case.
  if (!isAdmin && !isViewer) redirect('/login');

  // Impersonation override: when an admin owner has clicked "View as <client>"
  // and the impersonate cookies are present, render the shell exactly as a
  // viewer would see it — admin sidebar collapsed, edit affordances hidden,
  // brand switcher locked to the impersonated brand. The underlying user is
  // still admin (so the banner's "Exit impersonation" works and getActiveBrand
  // already resolves the impersonated client), but the UI mirrors the viewer
  // surface so it's a faithful preview, not "admin UI scoped to client X."
  const cookieStore = await cookies();
  const isImpersonating =
    isAdmin &&
    cookieStore.has('x-impersonate-org') &&
    cookieStore.has('x-impersonate-slug');

  // Brand resolution branches by role; both paths produce the same shape
  // (`AdminBrand[]` + nullable active brand) so the rest of the shell
  // stays role-agnostic. Impersonation falls through the admin path —
  // getActiveBrand reads the impersonate cookies and returns the
  // impersonated client; the brand list is locked to that single brand
  // so the switcher reads as "Viewing as <client>" with nothing else.
  const [{ brand, availableBrands }] = await Promise.all([
    isAdmin
      ? Promise.all([
          getActiveBrand().catch(() => ({ brand: null, source: 'none' as const, isAdmin: true })),
          isImpersonating
            ? Promise.resolve([])
            : listAdminAccessibleBrands().catch(() => []),
        ]).then(([active, brands]) => ({
          brand: active.brand,
          availableBrands: isImpersonating && active.brand ? [active.brand] : brands,
        }))
      : Promise.all([
          getActiveViewerBrand(user.id).catch(() => ({ brand: null, source: 'none' as const })),
          listViewerAccessibleBrands(user.id).catch(() => []),
        ]).then(([active, brands]) => ({ brand: active.brand, availableBrands: brands })),
  ]);

  const userName = userRow?.full_name || user.email || '';
  const avatarUrl = userRow?.avatar_url || null;
  const hiddenSidebarItems =
    (userRow?.hidden_sidebar_items as string[] | null) ?? [];
  // sidebarRole drives every UI affordance: sidebar admin items, edit
  // buttons (via `useActiveBrand().role`), settings href in the top bar.
  // Treating impersonation as a viewer surface here is the single switch
  // that makes /admin/* nav, edit pencils on /brand-profile, etc. all
  // behave the way a real client would experience them.
  const sidebarRole: 'admin' | 'viewer' = isAdmin && !isImpersonating ? 'admin' : 'viewer';
  const showAdminAffordances = isAdmin && !isImpersonating;

  return (
    <SWRProvider>
      <BackgroundSearchProvider>
        <ActiveBrandProvider
          initialBrand={brand}
          availableBrands={availableBrands}
          role={sidebarRole}
        >
          <SidebarProvider
            topBar={
              <AdminTopBar
                userName={userName}
                avatarUrl={avatarUrl}
                settingsHref={showAdminAffordances ? '/admin/settings' : undefined}
                apiDocsHref={showAdminAffordances ? '/admin/nerd/api' : undefined}
                logoutRedirect="/login"
              />
            }
          >
            <ImpersonationBanner />
            <EasterEgg />
            <CommandPalette />
            <AdminSidebar
              userName={userName}
              avatarUrl={avatarUrl}
              hiddenSidebarItems={hiddenSidebarItems}
              role={sidebarRole}
              routePrefix=""
              isSuperAdmin={showAdminAffordances && isSuperAdmin}
            />
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
