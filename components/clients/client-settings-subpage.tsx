'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plug, UsersRound, Bell } from 'lucide-react';
import { ConnectedAccounts } from '@/components/clients/connected-accounts';
import { PortalAccessCard, DangerZone } from '@/components/clients/client-settings-section';
import { SectionLabel } from '@/components/clients/client-profile-fields';
import { ClientAccessServicesPanel } from '@/components/clients/client-access-services-panel';
import { RevisionWebhookSettings } from '@/components/clients/revision-webhook-settings';

type ClientPayload = {
  id: string;
  name: string;
  is_active: boolean;
  has_affiliate_integration?: boolean;
};

export function ClientSettingsSubpage({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ClientPayload | null>(null);
  const [isActive, setIsActive] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || 'Failed to load client');
        }
        const d = await res.json() as { client: ClientPayload };
        if (cancelled) return;
        const c = d.client;
        setClient(c);
        setIsActive(c.is_active);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
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
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (loading || !client) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <Loader2 size={24} className="animate-spin text-accent-text" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">General</h2>
        <p className="text-sm text-text-muted mt-0.5">
          Integrations and access for {client.name}. Email digests are under{' '}
          <a
            href={`/admin/clients/${slug}/settings/notifications`}
            className="text-accent-text hover:underline font-medium"
          >
            Notifications
          </a>
          .
        </p>
      </div>

      <SectionLabel icon={Plug} label="Integrations" />
      <ConnectedAccounts clientId={client.id} hasAffiliateIntegration={client.has_affiliate_integration} />

      <ClientAccessServicesPanel slug={slug} />

      <SectionLabel icon={Bell} label="Notifications" />
      <RevisionWebhookSettings clientId={client.id} />

      <SectionLabel icon={UsersRound} label="Portal users" />
      <PortalAccessCard clientId={client.id} />

      <DangerZone
        clientId={client.id}
        clientName={client.name}
        isActive={isActive}
        setIsActive={setIsActive}
      />
    </div>
  );
}
