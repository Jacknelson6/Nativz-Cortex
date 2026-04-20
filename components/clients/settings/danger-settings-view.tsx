'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { DangerZone } from '@/components/clients/client-settings-section';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';

type DangerPayload = {
  id: string;
  name: string;
  is_active: boolean;
};

export function DangerSettingsView({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<DangerPayload | null>(null);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error((d as { error?: string }).error || 'Failed to load client');
        }
        const d = (await res.json()) as { client: DangerPayload };
        if (cancelled) return;
        setClient(d.client);
        setIsActive(d.client.is_active);
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
        icon={AlertTriangle}
        title="Archive / delete"
        subtitle="Deactivate hides the client from portal and lists. Delete is permanent."
      />
      <DangerZone
        clientId={client.id}
        clientName={client.name}
        isActive={isActive}
        setIsActive={setIsActive}
      />
    </div>
  );
}
