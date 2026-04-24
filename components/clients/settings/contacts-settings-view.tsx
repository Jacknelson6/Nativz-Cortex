'use client';

import { useEffect, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import { ClientContactsCard } from '@/components/clients/client-contacts-card';
import { PortalAccessCard } from '@/components/clients/client-settings-section';
import { SettingsPageHeader, SettingsSectionHeader } from '@/components/clients/settings/settings-primitives';

/**
 * `companyOnly` hides the Portal invites & users subsection. The info page
 * uses this — portal access lives under Access & services, not Info. The
 * standalone /settings/contacts page keeps both for backwards compat.
 */

type ContactsPayload = {
  id: string;
  name: string;
};

type PortalContact = {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  job_title: string | null;
  last_login: string | null;
};

export function ContactsSettingsView({
  slug,
  embedded,
  companyOnly,
}: {
  slug: string;
  embedded?: boolean;
  companyOnly?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ContactsPayload | null>(null);
  const [portalContacts, setPortalContacts] = useState<PortalContact[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error((d as { error?: string }).error || 'Failed to load client');
        }
        const d = (await res.json()) as {
          client: ContactsPayload;
          portalContacts?: PortalContact[];
        };
        if (cancelled) return;
        setClient(d.client);
        setPortalContacts(d.portalContacts ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) {
    return <div className="flex min-h-[20vh] items-center justify-center p-6 text-sm text-red-400">{error}</div>;
  }

  if (loading || !client) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center p-6">
        <Loader2 size={20} className="animate-spin text-accent-text" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <SettingsPageHeader
          icon={Users}
          title="Contacts"
          subtitle={`Company contacts and people with portal access for ${client.name}.`}
        />
      )}

      <ClientContactsCard
        clientId={client.id}
        clientName={client.name}
        portalContacts={companyOnly ? [] : portalContacts}
      />

      {!companyOnly && (
        <section className="space-y-3 pt-2">
          <SettingsSectionHeader
            title="Portal invites & users"
            description="People from this client who can sign in to the portal."
          />
          <PortalAccessCard clientId={client.id} />
        </section>
      )}
    </div>
  );
}
