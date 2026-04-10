import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import { AuditReport } from '@/components/audit/audit-report';

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

  return <AuditReport audit={audit} />;
}
