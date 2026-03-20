'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Building2, Search, Sparkles } from 'lucide-react';
import { ClientLogo } from '@/components/clients/client-logo';
import type { ClientOption } from '@/components/ui/client-picker';
import type { RecentClient } from '@/app/admin/ad-creatives/page';

interface AdCreativesClientPickProps {
  clients: ClientOption[];
  recentClients: RecentClient[];
  onSelectRoster: (id: string) => void;
  onSelectRecent: (rc: RecentClient) => void;
}

function agencyLabel(agency: string | null | undefined): string | null {
  if (!agency?.trim()) return null;
  const a = agency.toLowerCase();
  if (a.includes('anderson') || a === 'ac') return 'Anderson Collaborative';
  return 'Nativz';
}

function agencyClass(agency: string | null | undefined): string {
  const a = agency?.toLowerCase() ?? '';
  if (a.includes('anderson') || a === 'ac') return 'text-emerald-400/90';
  return 'text-accent-text/90';
}

/**
 * Rich client chooser for the ad creatives hub landing (replaces a lone dropdown).
 */
export function AdCreativesClientPick({
  clients,
  recentClients,
  onSelectRoster,
  onSelectRecent,
}: AdCreativesClientPickProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, query]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-nativz-border bg-surface shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-border/45 to-transparent"
        aria-hidden
      />
      <div className="pointer-events-none absolute -top-20 left-1/2 h-40 w-[120%] -translate-x-1/2 rounded-full bg-accent-text/[0.06] blur-3xl" aria-hidden />

      <div className="relative p-5 sm:p-6 space-y-6">
        <div className="text-center space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-text/90">
            Choose a client
          </p>
          <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed">
            Pick from recents or search the roster. We load brand context from{' '}
            <span className="text-text-secondary font-medium">Brand DNA</span> when it&apos;s ready, or crawl their
            site.
          </p>
        </div>

        {recentClients.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide text-center sm:text-left">
              Recent
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {recentClients.map((rc) => (
                <button
                  key={rc.clientId}
                  type="button"
                  onClick={() => onSelectRecent(rc)}
                  className="group relative flex flex-col items-center gap-2 rounded-2xl border border-nativz-border bg-background/40 p-4 text-center transition-all duration-200 hover:border-accent-border/50 hover:bg-accent-surface/10 hover:shadow-[0_0_0_1px_rgba(59,130,246,0.15),0_12px_32px_-12px_rgba(0,0,0,0.5)] cursor-pointer"
                >
                  <div className="relative">
                    <div className="absolute -inset-2 rounded-2xl bg-gradient-to-br from-accent-text/25 to-transparent opacity-0 blur-lg transition-opacity group-hover:opacity-100" />
                    <div className="relative">
                      <ClientLogo src={rc.logo_url} name={rc.name} size="lg" />
                    </div>
                  </div>
                  <span className="text-xs font-medium text-text-primary line-clamp-2 w-full leading-snug">
                    {rc.name}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium text-accent-text border border-accent-border/25">
                    <Sparkles size={10} />
                    {rc.creativeCount} ads
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide">All clients</p>
            <span className="text-[10px] text-text-muted tabular-nums">{filtered.length} shown</span>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name…"
              autoComplete="off"
              className="w-full rounded-xl border border-nativz-border bg-background/50 py-3 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted/60 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
            />
          </div>
          <div className="max-h-[min(42vh,340px)] overflow-y-auto rounded-xl border border-nativz-border/80 bg-background/25 pr-1">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                {clients.length === 0 && !query.trim() ? (
                  <>
                    <Building2 size={22} className="text-text-muted/50 mb-2" />
                    <p className="text-sm text-text-muted">No clients on your roster yet.</p>
                    <p className="text-xs text-text-muted mt-2 max-w-xs leading-relaxed">
                      Add clients in{' '}
                      <Link
                        href="/admin/clients"
                        className="text-accent-text underline-offset-2 hover:underline font-medium"
                      >
                        Admin → Clients
                      </Link>
                      , or switch to <span className="text-text-secondary font-medium">Website URL</span> to start from
                      a site.
                    </p>
                  </>
                ) : (
                  <>
                    <Search size={22} className="text-text-muted/50 mb-2" />
                    <p className="text-sm text-text-muted">No clients match &ldquo;{query.trim()}&rdquo;</p>
                  </>
                )}
              </div>
            ) : (
              <ul className="p-2 space-y-1">
                {filtered.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onSelectRoster(c.id)}
                      className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-all hover:border-nativz-border hover:bg-surface-hover/80 cursor-pointer"
                    >
                      <ClientLogo src={c.logo_url} name={c.name} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary truncate">{c.name}</p>
                        {agencyLabel(c.agency) && (
                          <p className={`text-[10px] font-semibold uppercase tracking-wide ${agencyClass(c.agency)}`}>
                            {agencyLabel(c.agency)}
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
