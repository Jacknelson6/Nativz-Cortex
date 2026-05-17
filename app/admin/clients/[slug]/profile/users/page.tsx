import { notFound } from 'next/navigation';
import { Users as UsersIcon } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';
import { WorkspaceSection } from '@/components/clients/profile/workspace-section';
import {
  AddContactButton,
  DeleteContactAction,
  EditContactButton,
  InviteActions,
  InviteButton,
  PortalUserActions,
  PrimaryStar,
  PendingDot,
} from '@/components/clients/profile/users-editors';

export const dynamic = 'force-dynamic';

type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  project_role: string | null;
  is_primary: boolean;
  avatar_url: string | null;
};

type InviteRow = {
  id: string;
  token: string;
  email: string | null;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

type PortalUser = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  last_login: string | null;
  is_active: boolean;
};

function initials(name: string | null, email: string | null): string {
  const base = (name?.trim() || email?.trim() || '?').replace(/[^a-zA-Z0-9 ]/g, '');
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({
  name,
  email,
  src,
}: {
  name: string | null;
  email: string | null;
  src: string | null;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? email ?? ''}
        className="h-9 w-9 rounded-full object-cover border border-nativz-border"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-surface text-[11px] font-medium text-accent-text ring-1 ring-inset ring-accent/20">
      {initials(name, email)}
    </div>
  );
}

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  const diff = Date.now() - ts;
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return 'just now';
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function ProfileUsersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select('id, name, agency, organization_id')
    .eq('slug', slug)
    .single<{ id: string; name: string; agency: string | null; organization_id: string | null }>();
  if (!client) notFound();

  const agency = getBrandFromAgency(client.agency);
  const baseUrl = getCortexAppUrl(agency);

  const [contactsRes, invitesRes, portalUsersRes] = await Promise.all([
    admin
      .from('contacts')
      .select('id, name, email, phone, role, project_role, is_primary, avatar_url')
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
      .select('id, email, full_name, avatar_url, last_login, is_active, user_client_access!inner(client_id)')
      .eq('role', 'viewer')
      .eq('user_client_access.client_id', client.id)
      .order('created_at', { ascending: false }),
  ]);

  const contacts: Contact[] = contactsRes.data ?? [];

  const pendingInvites: InviteRow[] = invitesRes.data ?? [];

  const portalUsers: PortalUser[] = (portalUsersRes.data ?? []).map(
    ({ user_client_access: _uca, ...rest }) => rest,
  );

  return (
    <>
      <SettingsPageHeader
        eyebrow="Brand profile"
        icon={UsersIcon}
        title="Users"
        subtitle="People we talk to + the ones with portal access. One list, one place to manage them."
      />

      <WorkspaceSection
        title="Contacts"
        description="The humans we email about projects, approvals, and invoices."
        action={<AddContactButton clientId={client.id} />}
      >
        {contacts.length === 0 ? (
          <EmptyRow label="No contacts yet. Add the brand POC to get started." />
        ) : (
          contacts.map((c) => (
            <UserRow
              key={c.id}
              avatar={<Avatar name={c.name} email={c.email} src={c.avatar_url} />}
              name={c.name}
              email={c.email}
              meta={[c.role, c.phone].filter(Boolean).join(' • ') || null}
              pills={[
                c.is_primary ? (
                  <Pill key="primary" tone="amber">
                    <PrimaryStar /> Primary
                  </Pill>
                ) : null,
                c.project_role ? (
                  <Pill key="role" tone="muted">
                    {c.project_role}
                  </Pill>
                ) : null,
              ]}
              actions={
                <div className="flex items-center gap-1">
                  <EditContactButton clientId={client.id} contact={c} />
                  <DeleteContactAction clientId={client.id} contactId={c.id} name={c.name} />
                </div>
              }
            />
          ))
        )}
      </WorkspaceSection>

      <WorkspaceSection
        title="Portal access"
        description="Clients who can sign in to view drops, approvals, and reports."
        action={<InviteButton clientId={client.id} />}
      >
        {portalUsers.length === 0 && pendingInvites.length === 0 ? (
          <EmptyRow label="Nobody has portal access yet. Invite the brand POC when they're ready." />
        ) : (
          <>
            {portalUsers.map((u) => (
              <UserRow
                key={u.id}
                avatar={<Avatar name={u.full_name} email={u.email} src={u.avatar_url} />}
                name={u.full_name ?? u.email}
                email={u.full_name ? u.email : null}
                meta={
                  u.last_login
                    ? `Last seen ${relativeTime(u.last_login)}`
                    : 'Hasn’t signed in yet'
                }
                pills={[
                  <Pill key="portal" tone="accent">
                    Portal viewer
                  </Pill>,
                  u.is_active ? null : (
                    <Pill key="off" tone="muted">
                      Disabled
                    </Pill>
                  ),
                ]}
                actions={
                  <PortalUserActions clientId={client.id} userId={u.id} name={u.full_name ?? u.email} />
                }
              />
            ))}
            {pendingInvites.map((inv) => (
              <UserRow
                key={inv.id}
                avatar={<Avatar name={inv.email} email={inv.email} src={null} />}
                name={inv.email ?? 'Invite link'}
                email={null}
                meta={`Sent ${relativeTime(inv.created_at)} • Expires ${relativeTime(
                  inv.expires_at,
                ) ?? new Date(inv.expires_at).toLocaleDateString()}`}
                pills={[
                  <Pill key="pending" tone="amber">
                    <PendingDot /> Pending invite
                  </Pill>,
                ]}
                actions={<InviteActions inviteId={inv.id} inviteUrl={`${baseUrl}/s/${inv.token}`} />}
              />
            ))}
          </>
        )}
      </WorkspaceSection>
    </>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="px-4 py-6 text-sm italic text-text-muted">{label}</div>
  );
}

function UserRow({
  avatar,
  name,
  email,
  meta,
  pills,
  actions,
}: {
  avatar: React.ReactNode;
  name: string;
  email: string | null;
  meta: string | null;
  pills?: (React.ReactNode | null)[];
  actions?: React.ReactNode;
}) {
  const livePills = (pills ?? []).filter(Boolean);
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-nativz-border/60 last:border-b-0">
      <div className="shrink-0">{avatar}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-text-primary truncate">{name}</span>
          {livePills}
        </div>
        <div className="text-xs text-text-muted truncate">
          {email && <span>{email}</span>}
          {email && meta && <span className="mx-1.5 text-text-muted/50">•</span>}
          {meta && <span>{meta}</span>}
        </div>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

function Pill({
  tone = 'muted',
  children,
}: {
  tone?: 'muted' | 'accent' | 'amber';
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'accent'
      ? 'border-accent/30 bg-accent-surface text-accent-text'
      : tone === 'amber'
      ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
      : 'border-nativz-border bg-background text-text-secondary';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${toneClass}`}
    >
      {children}
    </span>
  );
}
