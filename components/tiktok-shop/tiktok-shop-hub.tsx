'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ClientLogo } from '@/components/clients/client-logo';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ClientOption } from '@/components/ui/client-picker';
import {
  TikTokShopHistoryRail,
  type TikTokShopSearchSummary,
} from './tiktok-shop-history-rail';
import { cn } from '@/lib/utils/cn';

interface Props {
  initialSearches: TikTokShopSearchSummary[];
  userFirstName: string | null;
  clients: ClientOption[];
}

export function TikTokShopHub({ initialSearches, userFirstName, clients }: Props) {
  const router = useRouter();
  const [searches, setSearches] = useState(initialSearches);
  const [query, setQuery] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [brandPopoverOpen, setBrandPopoverOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const greetingName = userFirstName
    ? userFirstName.charAt(0).toUpperCase() + userFirstName.slice(1)
    : null;

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  const isValid = query.trim().length >= 2;

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clientQuery, clients]);

  function pickClient(id: string) {
    setClientId(id);
    setBrandPopoverOpen(false);
  }

  function clearBrand() {
    setClientId(null);
    setClientQuery('');
  }

  async function handleStart() {
    if (!isValid) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/insights/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          clientId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to start search');
        return;
      }
      toast.success('Searching TikTok Shop…');
      router.push(`/admin/competitor-tracking/tiktok-shop/${data.jobId}`);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* History rail — only this scrolls */}
      <div className="w-72 shrink-0 border-r border-nativz-border bg-surface/50 overflow-y-auto">
        <TikTokShopHistoryRail searches={searches} onSearchesChange={setSearches} />
      </div>

      {/* Main area — fixed, centered, no scroll */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
        <div className="w-full max-w-xl">
          <div className="text-center">
            <p className="text-sm font-medium text-text-muted">
              {greetingName ? `Hello, ${greetingName}` : 'Hello'}
            </p>
            <p className="mt-1.5 text-xl font-semibold tracking-tight text-text-primary md:text-2xl">
              Find TikTok Shop creators
            </p>
          </div>

          {/* Input card — category on top, brand pill + submit on bottom */}
          <div className="mx-auto mt-4 w-full max-w-xl overflow-hidden rounded-[1.75rem] border border-nativz-border bg-surface-hover/35 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_32px_-12px_rgba(0,0,0,0.45)] transition-colors focus-within:border-accent/35 focus-within:bg-surface-hover/50 focus-within:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(91,163,230,0.12),0_12px_40px_-16px_rgba(0,0,0,0.5)] md:mt-5">
            <label htmlFor="tt-shop-query" className="sr-only">Category keyword</label>
            <input
              id="tt-shop-query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a category — e.g. hair accessories, skincare serum"
              className="w-full min-h-[3.25rem] border-0 bg-transparent px-4 pt-4 pb-2 text-sm font-normal leading-relaxed text-foreground placeholder:text-text-muted/80 focus:outline-none md:min-h-[3.5rem] md:px-5 md:pt-5 md:text-base"
              autoComplete="off"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isValid) {
                  e.preventDefault();
                  void handleStart();
                }
              }}
            />

            <div className="flex flex-nowrap items-center gap-2 border-t border-nativz-border/60 px-3 pb-3 pt-2">
              <div className="flex min-h-[2.5rem] min-w-0 flex-1 items-center gap-2">
                <Popover open={brandPopoverOpen} onOpenChange={setBrandPopoverOpen}>
                  <div
                    className={cn(
                      'inline-flex h-9 max-w-[min(100%,13rem)] min-w-0 shrink-0 items-stretch rounded-full border border-nativz-border bg-surface-hover/80 text-xs font-medium text-text-secondary shadow-sm transition hover:border-accent/35 hover:bg-surface-hover',
                      selectedClient && 'pr-0.5',
                    )}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-text-secondary hover:bg-transparent"
                      >
                        {selectedClient ? (
                          <ClientLogo
                            src={selectedClient.logo_url}
                            name={selectedClient.name}
                            size="sm"
                            className="h-7 w-7 shrink-0 !rounded-md"
                          />
                        ) : (
                          <Building2 size={15} className="shrink-0 text-text-muted" aria-hidden />
                        )}
                        <span className="truncate">
                          {selectedClient ? selectedClient.name : 'Brand'}
                        </span>
                      </button>
                    </PopoverTrigger>
                    {selectedClient && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          clearBrand();
                        }}
                        className="flex shrink-0 items-center justify-center rounded-full p-1.5 text-text-muted transition hover:bg-background/40 hover:text-text-primary"
                        aria-label="Remove brand"
                      >
                        <X size={15} strokeWidth={2} aria-hidden />
                      </button>
                    )}
                  </div>
                  <PopoverContent
                    align="start"
                    sideOffset={8}
                    matchAnchorWidth={false}
                    className="w-[min(22rem,calc(100vw-2rem))] border-nativz-border bg-surface p-0 text-text-primary shadow-[var(--shadow-dropdown)]"
                  >
                    <div className="border-b border-nativz-border p-3">
                      <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                          type="text"
                          value={clientQuery}
                          onChange={(e) => setClientQuery(e.target.value)}
                          placeholder="Search clients…"
                          className="w-full rounded-lg border border-nativz-border bg-background py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-text-muted focus:border-accent focus:outline-none"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    <div
                      className="max-h-56 overflow-y-auto p-2"
                      role="listbox"
                      aria-label="Clients"
                    >
                      {filteredClients.length === 0 ? (
                        <p className="px-2 py-6 text-center text-sm text-text-muted">No matching clients</p>
                      ) : (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-2">
                          {filteredClients.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              role="option"
                              aria-selected={clientId === c.id}
                              onClick={() => pickClient(c.id)}
                              className={cn(
                                'flex flex-col items-center gap-1.5 rounded-xl border border-transparent p-2 text-center transition-colors hover:bg-surface-hover',
                                clientId === c.id && 'border-accent/35 bg-accent/10',
                              )}
                            >
                              <ClientLogo
                                src={c.logo_url}
                                name={c.name}
                                size="sm"
                                className="shrink-0 rounded-lg"
                              />
                              <span className="line-clamp-2 w-full text-[10px] font-medium leading-tight text-text-primary">
                                {c.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedClient && (
                      <div className="border-t border-nativz-border p-3">
                        <button
                          type="button"
                          onClick={() => {
                            clearBrand();
                            setBrandPopoverOpen(false);
                          }}
                          className="text-left text-xs text-text-muted hover:text-text-secondary"
                        >
                          Clear brand
                        </button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              <button
                type="button"
                onClick={() => void handleStart()}
                disabled={!isValid || loading}
                aria-label="Start search"
                className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full border border-accent/40 bg-accent text-white shadow-[0_0_24px_-6px_rgba(91,163,230,0.55)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" aria-hidden />
                ) : (
                  <ArrowRight size={18} strokeWidth={2.25} aria-hidden />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-4 text-center text-sm text-red-400">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
