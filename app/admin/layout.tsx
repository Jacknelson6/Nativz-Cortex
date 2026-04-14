import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { unstable_cache } from 'next/cache';

/** Avoid static prerender during `next build` when Preview env omits Supabase vars. */
export const dynamic = 'force-dynamic';
import { AdminSidebar } from '@/components/layout/admin-sidebar';
import { AdminSettingsSidebar } from '@/components/layout/admin-settings-sidebar';
import { AdminHeader } from '@/components/layout/admin-header';
import { SidebarProvider, SidebarInset } from '@/components/layout/sidebar';
import { EasterEgg } from '@/components/easter-egg';
import { CommandPalette } from '@/components/shared/command-palette';
import { PageTransition } from '@/components/shared/page-transition';
import { BackgroundSearchProvider } from '@/components/search/background-search-tracker';

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
      return <PageTransition>{children}</PageTransition>;
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

    return (
      <BackgroundSearchProvider>
        <SidebarProvider>
          <EasterEgg />
          <CommandPalette />
          <AdminSidebar userName={userName} avatarUrl={avatarUrl} />
          <AdminSettingsSidebar />
          <SidebarInset>
            <AdminHeader />
            <PageTransition>{children}</PageTransition>
          </SidebarInset>
        </SidebarProvider>
      </BackgroundSearchProvider>
    );
  } catch (err) {
    console.error('AdminLayout bootstrap failed:', err);
    // Degraded shell so /admin/login can still render if env/DB is misconfigured during local dev.
    return <PageTransition>{children}</PageTransition>;
  }
}
