'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Dna, Loader2, Search } from 'lucide-react';
import { ClientLogo } from '@/components/clients/client-logo';
import type { ClientOption } from '@/components/ui/client-picker';
import { tryParseUserWebsite } from '@/lib/utils/normalize-website-url';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

type Row =
  | { kind: 'url'; key: string; normalized: string; label: string }
  | {
      kind: 'client';
      key: string;
      id: string;
      name: string;
      logo_url?: string | null;
      agency?: string | null;
      /** First row in a block gets a section label above it. */
      sectionHeader?: string;
    };

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
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

interface AdCreativesStartCommandProps {
  query: string;
  onQueryChange: (q: string) => void;
  clients: ClientOption[];
  scanning: boolean;
  onSubmitUrl: (raw: string) => void;
  onSelectClient: (id: string) => void;
}

/**
 * Search field + Radix Popover: URL action (when pasted), then **All clients** filtered by query.
 * Recent clients render in `AdCreativesRecentGrid` below the bar on the landing page.
 */
export function AdCreativesStartCommand({
  query,
  onQueryChange,
  clients,
  scanning,
  onSubmitUrl,
  onSelectClient,
}: AdCreativesStartCommandProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const debouncedQuery = useDebounce(query, 300);
  const isDebouncing = query.trim() !== debouncedQuery.trim() && query.trim().length > 0;

  const qLive = query.trim();
  const urlParsedLive = useMemo(() => (qLive ? tryParseUserWebsite(qLive) : null), [qLive]);

  const qd = debouncedQuery.trim().toLowerCase();

  const rows = useMemo(() => {
    const out: Row[] = [];

    if (urlParsedLive) {
      out.push({
        kind: 'url',
        key: `url:${urlParsedLive.normalized}`,
        normalized: urlParsedLive.normalized,
        label: urlParsedLive.displayLabel,
      });
    }

    let roster = [...clients].sort((a, b) => a.name.localeCompare(b.name));
    if (qd) {
      roster = roster.filter((c) => c.name.toLowerCase().includes(qd));
    }

    const showAllClientsHeading = roster.length > 0 && urlParsedLive !== null;

    for (let j = 0; j < roster.length; j++) {
      const c = roster[j];
      out.push({
        kind: 'client',
        key: `client:${c.id}`,
        id: c.id,
        name: c.name,
        logo_url: c.logo_url,
        agency: c.agency,
        sectionHeader: j === 0 && showAllClientsHeading ? 'All clients' : undefined,
      });
    }

    return out;
  }, [clients, qd, urlParsedLive]);

  const showEmpty =
    open && !isDebouncing && debouncedQuery.trim() !== '' && rows.length === 0 && !urlParsedLive;

  useEffect(() => {
    setActiveIndex(0);
  }, [qLive, debouncedQuery, rows.length]);

  const activateRow = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return;
      if (row.kind === 'url') {
        onSubmitUrl(row.normalized);
      } else {
        onSelectClient(row.id);
      }
      setOpen(false);
    },
    [rows, onSubmitUrl, onSelectClient],
  );

  function handlePrimaryAction() {
    if (scanning || rows.length === 0) return;
    activateRow(activeIndex);
  }

  const showInputLoader = isDebouncing || scanning;
  const maxIndex = Math.max(0, rows.length - 1);

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <div className="flex items-start gap-2">
        <PopoverAnchor asChild>
          <div className="relative min-w-0 flex-1">
            <div
              className={`rounded-xl border border-nativz-border bg-surface transition-[box-shadow,border-color] focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/35 ${
                open ? 'shadow-[0_8px_28px_-16px_rgba(0,0,0,0.55)]' : ''
              } ${scanning ? 'opacity-80' : ''}`}
            >
              <div className="relative">
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-10 items-center justify-center text-text-muted"
                  aria-hidden
                >
                  <Search size={16} />
                  <span className="sr-only">Search</span>
                </div>
                <input
                  type="search"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={query}
                  onChange={(e) => {
                    onQueryChange(e.target.value);
                    setOpen(true);
                  }}
                  onFocus={() => setOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setOpen(true);
                      setActiveIndex((i) => Math.min(i + 1, maxIndex));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setOpen(true);
                      setActiveIndex((i) => Math.max(0, i - 1));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      if (rows[activeIndex]) activateRow(activeIndex);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setOpen(false);
                    }
                  }}
                  placeholder="Search clients or paste a website URL…"
                  disabled={scanning}
                  role="combobox"
                  aria-expanded={open}
                  aria-controls="ad-creatives-start-listbox"
                  aria-autocomplete="list"
                  className="peer w-full border-0 bg-transparent py-3 pl-10 text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:ring-0 disabled:cursor-not-allowed [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none pr-10"
                />
                {showInputLoader ? (
                  <div
                    className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-center pr-3 text-text-muted"
                    aria-hidden
                  >
                    <Loader2 size={16} className="animate-spin" />
                    <span className="sr-only">Loading…</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </PopoverAnchor>

        <Button
          type="button"
          size="lg"
          className="shrink-0"
          onClick={handlePrimaryAction}
          disabled={scanning || rows.length === 0}
          aria-label="Go"
        >
          {scanning ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        </Button>
      </div>

      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="grid max-h-[min(52vh,420px)] gap-2 overflow-y-auto p-2">
          {isDebouncing && rows.length === 0 && !urlParsedLive ? (
            <p className="py-2 text-center text-sm text-text-muted">Searching…</p>
          ) : null}
          <ul id="ad-creatives-start-listbox" role="listbox" className="space-y-1">
            {rows.map((row, i) => {
              const selected = i === activeIndex;
              if (row.kind === 'url') {
                return (
                  <li key={row.key} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => activateRow(i)}
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                        selected
                          ? 'bg-accent-surface/25 text-text-primary'
                          : 'text-text-primary hover:bg-surface-hover/80'
                      }`}
                    >
                      <Dna size={18} className="shrink-0 text-accent-text" strokeWidth={1.75} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">Generate Brand DNA from site</p>
                        <p className="truncate text-xs text-text-muted">{row.label}</p>
                      </div>
                    </button>
                  </li>
                );
              }

              const sub = agencyLabel(row.agency);

              return (
                <Fragment key={row.key}>
                  {row.sectionHeader ? (
                    <li role="presentation" className="list-none px-2 pt-2 first:pt-0">
                      <p className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                        {row.sectionHeader}
                      </p>
                    </li>
                  ) : null}
                  <li role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => activateRow(i)}
                      className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                        selected ? 'bg-accent-surface/25' : 'hover:bg-surface-hover/80'
                      }`}
                    >
                      <ClientLogo src={row.logo_url} name={row.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-primary">{row.name}</p>
                        {sub ? (
                          <p
                            className={`text-[10px] font-semibold uppercase tracking-wide ${agencyClass(row.agency)}`}
                          >
                            {sub}
                          </p>
                        ) : null}
                      </div>
                      <Building2 size={14} className="shrink-0 text-text-muted" strokeWidth={1.75} />
                    </button>
                  </li>
                </Fragment>
              );
            })}
            {showEmpty ? (
              <li className="py-3 text-center text-sm text-text-muted">No clients found</li>
            ) : null}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
