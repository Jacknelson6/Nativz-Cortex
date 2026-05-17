import { notFound } from 'next/navigation';
import { Eye } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { ClientLogo } from '@/components/clients/client-logo';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';
import {
  WorkspaceSection,
  WorkspaceRow,
} from '@/components/clients/profile/workspace-section';
import { BasicsEditor } from '@/components/clients/profile/identity-editors';

export const dynamic = 'force-dynamic';

type ClientRow = {
  id: string;
  name: string | null;
  slug: string | null;
  industry: string | null;
  website_url: string | null;
  agency: string | null;
  logo_url: string | null;
  lifecycle_state: string | null;
  description: string | null;
  services: string[] | null;
};

type ContactRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  project_role: string | null;
  is_primary: boolean | null;
};

const LIFECYCLE_LABEL: Record<string, string> = {
  lead: 'Lead',
  contracted: 'Contracted',
  paid_deposit: 'Deposit paid',
  active: 'Active',
  churned: 'Churned',
};

export default async function ProfileOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select(
      [
        'id', 'name', 'slug', 'industry', 'website_url', 'agency', 'logo_url',
        'lifecycle_state', 'description', 'services',
      ].join(','),
    )
    .eq('slug', slug)
    .single<ClientRow>();
  if (!client) notFound();

  const { data: contactsData } = await admin
    .from('contacts')
    .select('id, name, email, role, project_role, is_primary')
    .eq('client_id', client.id)
    .order('is_primary', { ascending: false })
    .order('name');
  const contacts: ContactRow[] = contactsData ?? [];

  const lifecycleLabel = client.lifecycle_state
    ? LIFECYCLE_LABEL[client.lifecycle_state] ?? client.lifecycle_state
    : null;

  const services = (client.services ?? []).filter(Boolean);

  return (
    <>
      <SettingsPageHeader
        eyebrow="Brand profile"
        icon={Eye}
        title="Overview"
        subtitle="The at-a-glance read on this brand. Edit any of it from the rail on the left."
      />

      <BasicsEditor
        clientId={client.id}
        initial={{
          name: client.name ?? '',
          website_url: client.website_url ?? '',
          industry: client.industry ?? '',
          description: client.description ?? '',
        }}
      />

      <WorkspaceSection
        title="Context"
        description="Read-only properties. Manage from Deliverables + Identity."
      >
        <WorkspaceRow label="Lifecycle" value={lifecycleLabel} />
        <WorkspaceRow label="Agency" value={client.agency} />
        <WorkspaceRow
          label="Logo"
          rightSlot={
            <ClientLogo
              src={client.logo_url}
              name={client.name ?? slug}
              size="md"
            />
          }
        />
      </WorkspaceSection>

      <WorkspaceSection
        title="Points of contact"
        description="Who on the client side we talk to. Manage the roster from Users."
      >
        {contacts.length === 0 ? (
          <div className="px-5 py-6 text-sm italic text-text-muted">
            No contacts saved yet.
          </div>
        ) : (
          contacts.map((c) => (
            <WorkspaceRow
              key={c.id}
              label={
                <span className="flex items-center gap-2">
                  {c.name?.trim() || c.email || 'Unnamed'}
                  {c.is_primary && (
                    <span className="rounded-full bg-accent-surface px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-text">
                      Primary
                    </span>
                  )}
                </span>
              }
              hint={[c.project_role, c.role].filter(Boolean).join(' · ') || undefined}
              value={c.email}
            />
          ))
        )}
      </WorkspaceSection>

      <WorkspaceSection
        title="Services enabled"
        description="What we deliver for this brand each month."
      >
        <div className="px-5 py-5">
          {services.length === 0 ? (
            <span className="text-sm italic text-text-muted">No services enabled.</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent-surface px-3 py-1 text-xs font-medium text-accent-text ring-1 ring-inset ring-accent/15"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </WorkspaceSection>
    </>
  );
}
