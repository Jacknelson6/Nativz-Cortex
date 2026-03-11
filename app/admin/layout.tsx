import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { unstable_cache } from 'next/cache';
import { AdminSidebar } from '@/components/layout/admin-sidebar';
import { AdminHeader } from '@/components/layout/admin-header';
import { SidebarProvider, SidebarInset } from '@/components/layout/sidebar';
import { EasterEgg } from '@/components/easter-egg';
import { CommandPalette } from '@/components/shared/command-palette';
import { PageTransition } from '@/components/shared/page-transition';

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
      <AdminSidebar userName={userName} avatarUrl={avatarUrl} />
      <SidebarInset>
        <AdminHeader />
        <PageTransition>{children}</PageTransition>
      </SidebarInset>
    </SidebarProvider>
  );
}
