'use client';

import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { ClientLogo } from '@/components/clients/client-logo';

export type ConnectionStatus = 'connected' | 'disconnected' | 'paused';

export interface PortfolioClient {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  agency: string | null;
  connectionStatus: ConnectionStatus;
}

interface ClientPortfolioSelectorProps {
  clients: PortfolioClient[];
  onSelect: (clientId: string) => void;
  title?: string;
  subtitle?: string;
}

const STATUS_DOT: Record<ConnectionStatus, { color: string; label: string }> = {
  connected: { color: 'bg-emerald-400', label: 'Connected' },
  disconnected: { color: 'bg-amber-400', label: 'Not connected' },
  paused: { color: 'bg-amber-400', label: 'Paused' },
};

export function ClientPortfolioSelector({
  clients,
  onSelect,
  title = 'Select a client',
  subtitle,
}: ClientPortfolioSelectorProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter(c => c.name.toLowerCase().includes(q));
  }, [clients, search]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
        {subtitle && <p className="text-sm text-text-muted mt-1">{subtitle}</p>}
      </div>

      {/* Search */}
      <div className="relative max-w-sm mx-auto mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients..."
          className="w-full rounded-xl border border-nativz-border bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
      </div>

      {/* Client grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {filtered.map((client) => {
          const dot = STATUS_DOT[client.connectionStatus];
          return (
            <button
              key={client.id}
              onClick={() => onSelect(client.id)}
              className="group relative flex flex-col items-center gap-2.5 rounded-xl border border-nativz-border bg-surface p-4 text-center transition-all hover:border-accent/35 hover:bg-surface-hover hover:shadow-md cursor-pointer"
            >
              {/* Status dot — top right */}
              <div
                className={`absolute top-2.5 right-2.5 h-2 w-2 rounded-full ${dot.color}`}
                title={dot.label}
              />

              <ClientLogo
                src={client.logo_url}
                name={client.name}
                size="md"
                className="rounded-lg"
              />
              <div className="w-full">
                <p className="text-sm font-medium text-text-primary truncate">{client.name}</p>
                {client.agency && (
                  <p className="text-[10px] text-text-muted mt-0.5 truncate">{client.agency}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-sm text-text-muted">
          No clients match your search
        </div>
      )}
    </div>
  );
}
