import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ProjectsClient } from '@/components/projects/projects-client';

export const metadata = {
  title: 'Project management',
};

export default async function AdminProjectsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const adminClient = createAdminClient();
  const { data: userData } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userData?.role !== 'admin') redirect('/portal');

  return (
    <Suspense fallback={null}>
      <ProjectsClient />
    </Suspense>
  );
}
