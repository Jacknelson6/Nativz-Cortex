'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import Link from 'next/link';
import {
  ClientPortfolioSelector,
  type PortfolioClient,
} from '@/components/ui/client-portfolio-selector';

/**
 * Thin client wrapper around <ClientPortfolioSelector/>. Owns the "pick a
 * brand → write cookie → navigate back" flow; lets the presentational
 * selector stay dumb and reusable (the analytics landing uses the same
 * component with its own onSelect semantics).
 */
export function SelectBrandClient({
  clients,
  returnTo,
}: {
  clients: PortfolioClient[];
  returnTo: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(clientId: string) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/active-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`;
        setError(`Couldn't switch brand: ${msg}`);
        setPending(false);
        return;
      }
      // Navigate back to the caller and refresh server components so the
      // pill + any brand-scoped pages re-seed from the new cookie.
      router.push(returnTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top row — back link + onboard CTA so the picker isn't a dead-end */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push(returnTo)}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <Link
          href="/admin/clients/onboard"
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
        >
          <Plus size={14} />
          Onboard client
        </Link>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
        >
          {error}
        </div>
      )}

      <div className={pending ? 'pointer-events-none opacity-60' : ''}>
        <ClientPortfolioSelector
          clients={clients}
          onSelect={handleSelect}
          title="Client portfolio"
          subtitle="Select a brand to attach to this session"
        />
      </div>
    </div>
  );
}
