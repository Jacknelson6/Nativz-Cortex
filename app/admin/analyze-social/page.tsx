import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { AuditHub } from '@/components/audit/audit-hub';
import { selectClientsWithRosterVisibility } from '@/lib/clients/roster-visibility-query';
import { getVaultClients } from '@/lib/vault/reader';
import { getActiveBrand } from '@/lib/active-brand';

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
  if (!user) redirect('/login');

  const adminClient = createAdminClient();

  const [{ data: auditRows }, { data: userRow }, vaultClients, rosterResult, active] = await Promise.all([
    adminClient
      .from('prospect_audits')
      .select(
        'id, tiktok_url, website_url, status, created_at, prospect_data, scorecard, attached_client:attached_client_id(name)',
      )
      .order('created_at', { ascending: false })
      .limit(20),
    adminClient.from('users').select('full_name').eq('id', user.id).single(),
    getVaultClients(),
    selectClientsWithRosterVisibility<AuditHubDbClientRow>(adminClient, {
      select: 'id, slug, logo_url, is_active, agency',
      onlyActive: true,
    }),
    getActiveBrand().catch(() => null),
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

  // Flatten the nested `attached_client.name` onto the row so the rail can
  // render the brand label without learning the DB shape. Supabase hands the
  // nested row back as an object (or array of one) depending on the FK — we
  // accept both shapes defensively.
  const audits = (auditRows ?? []).map((row) => {
    const { attached_client, ...rest } = row as typeof row & {
      attached_client?: { name: string | null } | { name: string | null }[] | null;
    };
    const attached = Array.isArray(attached_client) ? attached_client[0] : attached_client;
    return {
      ...rest,
      attached_client_name: attached?.name ?? null,
    };
  });

  // Seed the audit hub from the top-bar pill so "run an audit for the
  // currently-pinned brand" is the zero-click default.
  const initialClientId = active?.brand?.id ?? null;

  return (
    <AuditHub
      audits={audits}
      userFirstName={firstName}
      clients={clients}
      initialClientId={initialClientId}
    />
  );
}
