import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import { AuditReport } from '@/components/audit/audit-report';
import { AnalysisChatDrawer } from '@/components/analyses/analysis-chat-drawer';

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const adminClient = createAdminClient();
  const { data: audit } = await adminClient
    .from('prospect_audits')
    .select('*')
    .eq('id', id)
    .single();

  if (!audit) notFound();

  // Drawer mounts only when the audit has actually completed — an
  // in-progress audit has no stable data for the agent to reason over.
  const pd = audit.prospect_data as { websiteContext?: { title?: string | null } } | null;
  const drawerLabel =
    pd?.websiteContext?.title?.trim() ||
    audit.website_url ||
    'this audit';
  const drawerMountable = audit.status === 'completed';

  return (
    <>
      <AuditReport audit={audit} />
      {drawerMountable && (
        <AnalysisChatDrawer
          scopeType="audit"
          scopeId={audit.id}
          scopeLabel={drawerLabel}
          strategyLabHref={`/lab?attach=audit:${audit.id}`}
        />
      )}
    </>
  );
}
