'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ClientProfileForm, type ClientProfileFormProps } from '@/components/clients/client-profile-form';

export function ClientProfilePageClient({ slug }: { slug: string }) {
  const [data, setData] = useState<ClientProfileFormProps | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || 'Failed to load client');
        }
        const d = (await res.json()) as ClientProfileFormProps;
        if (!cancelled) setData(d);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
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

  if (!data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <Loader2 size={24} className="animate-spin text-accent-text" />
      </div>
    );
  }

  return (
    <ClientProfileForm {...data} embeddedInShell />
  );
}
