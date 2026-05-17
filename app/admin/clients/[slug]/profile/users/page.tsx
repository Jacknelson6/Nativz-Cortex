import { notFound } from 'next/navigation';
import { Users as UsersIcon } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';
import { ClientContactsCard } from '@/components/clients/client-contacts-card';

export const dynamic = 'force-dynamic';

type Contact = {
  id: string;
  client_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  project_role: string | null;
  is_primary: boolean;
  created_at: string;
};

type InviteRow = {
  id: string;
  token: string;
  email: string | null;
  invite_url: string;
  status: 'active' | 'used' | 'expired';
  expires_at: string;
  used_at: string | null;
  used_by: { email: string; full_name: string } | null;
  created_at: string;
};

type PortalContact = {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  job_title: string | null;
  last_login: string | null;
};

export default async function ProfileUsersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select('id, name, agency')
    .eq('slug', slug)
    .single<{ id: string; name: string; agency: string | null }>();
  if (!client) notFound();

  const agency = getBrandFromAgency(client.agency);
  const baseUrl = getCortexAppUrl(agency);

  const [contactsRes, invitesRes, portalUsersRes] = await Promise.all([
    admin
      .from('contacts')
      .select('id, client_id, name, email, phone, role, project_role, is_primary, created_at')
      .eq('client_id', client.id)
      .order('is_primary', { ascending: false })
      .order('name'),
    admin
      .from('invite_tokens')
      .select('id, token, email, expires_at, used_at, created_at')
      .eq('client_id', client.id)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
    admin
      .from('users')
      .select(
        'id, email, full_name, avatar_url, last_login, user_client_access!inner(client_id)',
      )
      .eq('role', 'viewer')
      .eq('user_client_access.client_id', client.id)
      .order('created_at', { ascending: false }),
  ]);

  const contacts: Contact[] = contactsRes.data ?? [];

  const invites: InviteRow[] = (invitesRes.data ?? []).map((inv) => ({
    id: inv.id,
    token: inv.token,
    email: inv.email,
    invite_url: `${baseUrl}/s/${inv.token}`,
    status: 'active' as const,
    expires_at: inv.expires_at,
    used_at: inv.used_at,
    used_by: null,
    created_at: inv.created_at,
  }));

  const portalContacts: PortalContact[] = (portalUsersRes.data ?? []).map((u) => ({
    id: u.id,
    full_name: u.full_name ?? u.email,
    email: u.email,
    avatar_url: u.avatar_url,
    job_title: null,
    last_login: u.last_login,
  }));

  return (
    <>
      <SettingsPageHeader
        eyebrow="Brand profile"
        icon={UsersIcon}
        title="Users"
        subtitle="Everyone we talk to about this brand. Each row shows whether they have Cortex access — invite them from the row when they need it."
      />

      <section className="scroll-mt-24">
        <header className="mb-4">
          <h2 className="ui-section-title">Contacts &amp; portal access</h2>
          <p className="mt-1.5 text-[13px] text-text-muted leading-relaxed max-w-[60ch]">
            One unified roster. People with Cortex access show a green badge;
            pending invites show amber. Send, resend, or revoke invites inline.
          </p>
        </header>
        <div className="rounded-2xl border border-nativz-border bg-surface px-5 py-5 sm:px-6 sm:py-6">
          <ClientContactsCard
            clientId={client.id}
            clientName={client.name}
            initialContacts={contacts}
            initialInvites={invites}
            portalContacts={portalContacts}
            bare
          />
        </div>
      </section>
    </>
  );
}
