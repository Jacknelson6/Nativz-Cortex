'use client';

import { useEffect, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import { ClientContactsCard } from '@/components/clients/client-contacts-card';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';

/**
 * Contacts and portal users are unified in `<ClientContactsCard>` — each row
 * shows a single person with a state pill (Cortex user / Invited / no invite)
 * and inline invite/resend actions. The `companyOnly` flag is kept for the
 * Info page caller; the card itself handles hiding portal data when no portal
 * users exist.
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
  initialClient,
}: {
  slug: string;
  embedded?: boolean;
  companyOnly?: boolean;
  /** Pre-fetched client identity. When supplied (typically from a server
   *  component that already has it), the view skips the /api/clients/:slug
   *  round-trip — and when `companyOnly` is also set, portal contacts are
   *  never fetched at all. */
  initialClient?: ContactsPayload;
}) {
  const [loading, setLoading] = useState(!initialClient);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ContactsPayload | null>(initialClient ?? null);
  const [portalContacts, setPortalContacts] = useState<PortalContact[]>([]);

  useEffect(() => {
    if (initialClient && companyOnly) return;
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
        if (!initialClient) setClient(d.client);
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
  }, [slug, initialClient, companyOnly]);

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
    </div>
  );
}
