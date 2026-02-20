import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PortalSidebar, PortalNavItems } from '@/components/layout/portal-sidebar';
import { Header } from '@/components/layout/header';
import { SidebarProvider } from '@/components/layout/sidebar-provider';
import { MobileSidebar } from '@/components/layout/mobile-sidebar';

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  let userName = '';
  let avatarUrl: string | null = null;
  if (user) {
    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('full_name, avatar_url')
      .eq('id', user.id)
      .single();
    userName = userData?.full_name || user.email || '';
    avatarUrl = userData?.avatar_url || null;
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen flex-col">
        <Header portalMode />
        <div className="flex flex-1 overflow-hidden">
          <PortalSidebar userName={userName} avatarUrl={avatarUrl} />
          <MobileSidebar>
            <PortalNavItems />
          </MobileSidebar>
          <main className="flex-1 overflow-y-auto bg-background">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
