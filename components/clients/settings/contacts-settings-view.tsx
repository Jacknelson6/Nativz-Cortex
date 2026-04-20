'use client';

import { useEffect, useState } from 'react';
import { Loader2, Users, ShieldCheck } from 'lucide-react';
import { ClientContactsCard } from '@/components/clients/client-contacts-card';
import { PortalAccessCard } from '@/components/clients/client-settings-section';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';

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

export function ContactsSettingsView({ slug }: { slug: string }) {
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
      <SettingsPageHeader
        icon={Users}
        title="Contacts"
        subtitle={`Company contacts and people with portal access for ${client.name}.`}
      />

      <ClientContactsCard
        clientId={client.id}
        clientName={client.name}
        portalContacts={portalContacts}
      />

      <div className="flex items-center gap-3 pt-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-surface border border-nativz-border">
          <ShieldCheck size={16} className="text-accent-text" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-text-primary">Portal invites & users</h2>
          <p className="text-xs text-text-muted">People from this client who can sign in to the portal.</p>
        </div>
      </div>
      <PortalAccessCard clientId={client.id} />
    </div>
  );
}
