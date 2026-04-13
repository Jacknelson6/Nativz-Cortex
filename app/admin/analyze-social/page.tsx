import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { AuditHub } from '@/components/audit/audit-hub';

export default async function AuditPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const adminClient = createAdminClient();

  // Fetch recent audits for the history rail
  const { data: audits } = await adminClient
    .from('prospect_audits')
    .select('id, tiktok_url, website_url, status, created_at, prospect_data, scorecard')
    .order('created_at', { ascending: false })
    .limit(20);

  // Get user first name for greeting — matches the Research page pattern
  // (full_name column, not display_name; fall back to auth email prefix).
  const { data: userRow } = await adminClient
    .from('users')
    .select('full_name')
    .eq('id', user.id)
    .single();

  const raw = userRow?.full_name?.trim();
  const firstName =
    raw && raw.length > 0
      ? raw.split(/\s+/)[0] ?? null
      : user.email?.split('@')[0] ?? null;

  return <AuditHub audits={audits ?? []} userFirstName={firstName} />;
}
