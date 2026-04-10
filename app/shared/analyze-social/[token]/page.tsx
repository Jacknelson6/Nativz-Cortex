import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import { SharedAuditClient } from './shared-audit-client';

export default async function SharedAuditPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const adminClient = createAdminClient();

  const { data: link } = await adminClient
    .from('audit_share_links')
    .select('audit_id, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!link) notFound();

  // Check expiry
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    notFound();
  }

  const { data: audit } = await adminClient
    .from('prospect_audits')
    .select('*')
    .eq('id', link.audit_id)
    .single();

  if (!audit || audit.status !== 'completed') notFound();

  return <SharedAuditClient audit={audit} />;
}
