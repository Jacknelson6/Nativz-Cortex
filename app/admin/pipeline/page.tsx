import { createAdminClient } from '@/lib/supabase/admin';
import PipelineView from '@/components/pipeline/pipeline-view';
import type { PipelineItem, TeamMember } from '@/components/pipeline/pipeline-view';

export default async function PipelinePage() {
  const now = new Date();
  const initialMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const adminClient = createAdminClient();

  const [pipelineResult, teamResult] = await Promise.all([
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
  ]);

  const initialItems: PipelineItem[] = (pipelineResult.data ?? []) as PipelineItem[];
  const initialTeamMembers: TeamMember[] = (teamResult.data ?? []).map((m) => ({
    id: m.id,
    full_name: m.full_name,
    role: m.role ?? '',
    avatar_url: m.avatar_url ?? null,
  }));

  return (
    <PipelineView
      initialItems={initialItems}
      initialTeamMembers={initialTeamMembers}
      initialMonth={initialMonth}
    />
  );
}
