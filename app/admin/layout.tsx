import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { unstable_cache } from 'next/cache';
import { AdminSidebar, AdminNavItems } from '@/components/layout/admin-sidebar';
import { Header } from '@/components/layout/header';
import { SidebarProvider } from '@/components/layout/sidebar-provider';
import { MobileSidebar } from '@/components/layout/mobile-sidebar';
import { EasterEgg } from '@/components/easter-egg';
import { CommandPalette } from '@/components/shared/command-palette';
import { PageTransition } from '@/components/shared/page-transition';

export const dynamic = 'force-dynamic';

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
  { revalidate: 300 }, // 5 minutes
);

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  let userName = '';
  let avatarUrl: string | null = null;
  if (user) {
    const userData = await getCachedUser(user.id);
    userName = userData?.full_name || user.email || '';
    avatarUrl = userData?.avatar_url || null;
  }

  return (
    <SidebarProvider>
      <EasterEgg />
      <CommandPalette />
      <div className="flex h-screen flex-col">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <AdminSidebar userName={userName} avatarUrl={avatarUrl} />
          <MobileSidebar>
            <AdminNavItems />
          </MobileSidebar>
          <main className="flex-1 overflow-y-auto bg-background">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
