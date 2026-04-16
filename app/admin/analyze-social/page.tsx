import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { AuditHub } from '@/components/audit/audit-hub';
import { selectClientsWithRosterVisibility } from '@/lib/clients/roster-visibility-query';
import { getVaultClients } from '@/lib/vault/reader';

type AuditHubDbClientRow = {
  id: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
  agency: string | null;
};

export default async function AuditPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const adminClient = createAdminClient();

  const [{ data: audits }, { data: userRow }, vaultClients, rosterResult] = await Promise.all([
    adminClient
      .from('prospect_audits')
      .select('id, tiktok_url, website_url, status, created_at, prospect_data, scorecard')
      .order('created_at', { ascending: false })
      .limit(20),
    adminClient.from('users').select('full_name').eq('id', user.id).single(),
    getVaultClients(),
    selectClientsWithRosterVisibility<AuditHubDbClientRow>(adminClient, {
      select: 'id, slug, logo_url, is_active, agency',
      onlyActive: true,
    }),
  ]);

  const raw = userRow?.full_name?.trim();
  const firstName =
    raw && raw.length > 0
      ? raw.split(/\s+/)[0] ?? null
      : user.email?.split('@')[0] ?? null;

  if (rosterResult.error) {
    console.error('Audit hub roster query:', rosterResult.error);
  }
  const clients = (rosterResult.data || [])
    .map((db) => {
      const vault = vaultClients.find((v) => v.slug === db.slug);
      return {
        id: db.id,
        name: vault?.name || db.slug,
        logo_url: db.logo_url,
        agency: vault?.agency?.trim() || db.agency?.trim() || null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <AuditHub
      audits={audits ?? []}
      userFirstName={firstName}
      clients={clients}
    />
  );
}
