import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import PipelinePageClient from '@/components/pipeline/pipeline-page-client';
import type { PipelineItem, TeamMember } from '@/components/pipeline/pipeline-types';

export default async function PipelinePage() {
  const now = new Date();
  const initialMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const adminClient = createAdminClient();

  const [pipelineResult, teamResult, userResult, teamMemberResult] = await Promise.all([
    adminClient
      .from('content_pipeline')
      .select('*')
      .eq('month_date', initialMonth)
      .order('client_name', { ascending: true }),
    adminClient
      .from('team_members')
      .select('*')
      .eq('is_active', true)
      .order('full_name'),
    user
      ? adminClient.from('users').select('is_owner').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
    user
      ? adminClient.from('team_members').select('id, full_name, role').eq('user_id', user.id).single()
      : Promise.resolve({ data: null }),
  ]);

  const initialItems: PipelineItem[] = (pipelineResult.data ?? []) as PipelineItem[];
  const initialTeamMembers: TeamMember[] = (teamResult.data ?? []).map((m) => ({
    id: m.id,
    full_name: m.full_name,
    role: m.role ?? '',
    avatar_url: m.avatar_url ?? null,
  }));

  const isOwner = !!userResult.data?.is_owner;
  const userTeamMember = teamMemberResult.data
    ? { id: teamMemberResult.data.id, full_name: teamMemberResult.data.full_name, role: teamMemberResult.data.role ?? '' }
    : null;

  return (
    <PipelinePageClient
      initialItems={initialItems}
      initialTeamMembers={initialTeamMembers}
      initialMonth={initialMonth}
      userTeamMember={userTeamMember}
      isOwner={isOwner}
    />
  );
}
