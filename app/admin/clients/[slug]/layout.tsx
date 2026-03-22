import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ClientAdminShell } from '@/components/clients/client-admin-shell';

export default async function AdminClientSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    notFound();
  }

  const admin = createAdminClient();
  const { data: userData } = await admin
    .from('users')
    .select('role, organization_id')
    .eq('id', user.id)
    .single();

  const { data: client } = await admin
    .from('clients')
    .select('id, name, slug, organization_id')
    .eq('slug', slug)
    .single();

  if (!client) {
    notFound();
  }

  if (userData?.role === 'viewer' && client.organization_id !== userData.organization_id) {
    notFound();
  }

  return (
    <ClientAdminShell
      value={{
        slug: client.slug ?? slug,
        clientName: client.name ?? slug,
      }}
    >
      {children}
    </ClientAdminShell>
  );
}
