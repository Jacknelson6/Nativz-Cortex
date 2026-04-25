import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Briefcase, CheckSquare } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SectionHeader, SectionTabs } from '@/components/admin/section-tabs';
import { ProjectsClient } from '@/components/projects/projects-client';
import { TasksPane } from '@/components/projects/tasks-pane';

export const metadata = {
  title: 'Project management',
};

const TABS = [
  { slug: 'pipelines', label: 'Pipelines', icon: <Briefcase size={13} /> },
  { slug: 'tasks', label: 'Tasks', icon: <CheckSquare size={13} /> },
] as const;

type Tab = (typeof TABS)[number]['slug'];

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
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

  const sp = await searchParams;
  const tab: Tab = sp.tab === 'tasks' ? 'tasks' : 'pipelines';

  return (
    <div className="cortex-page-gutter max-w-7xl mx-auto space-y-6">
      <SectionHeader title="Project management" />
      <SectionTabs tabs={TABS} active={tab} memoryKey="admin:projects:tab" />

      <Suspense fallback={null}>
        {tab === 'tasks' ? <TasksPane /> : <ProjectsClient />}
      </Suspense>
    </div>
  );
}
