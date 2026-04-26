'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { ChevronDown, Globe, Search, Swords, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { VersusComparison } from '@/components/spying/versus-comparison';
import type { VersusAuditRow } from '@/components/spying/versus-types';

interface VersusBoardProps {
  audits: VersusAuditRow[];
  initialA: string | null;
  initialB: string | null;
}

export function VersusBoard({ audits, initialA, initialB }: VersusBoardProps) {
  const router = useRouter();
  const pathname = usePathname();
  // Resolve initial picks against the actual audit list — if either ID
  // doesn't exist (deleted, wrong brand, etc.) we silently drop it
  // rather than hand a phantom ID to the comparison component.
  const auditMap = useMemo(() => {
    const m = new Map<string, VersusAuditRow>();
    for (const a of audits) m.set(a.id, a);
    return m;
  }, [audits]);

  const [selectedA, setSelectedA] = useState<string | null>(
    initialA && auditMap.has(initialA) ? initialA : null,
  );
  const [selectedB, setSelectedB] = useState<string | null>(
    initialB && auditMap.has(initialB) ? initialB : null,
  );

  const auditA = selectedA ? auditMap.get(selectedA) ?? null : null;
  const auditB = selectedB ? auditMap.get(selectedB) ?? null : null;

  // Push state to URL so picks are shareable. `replace` instead of `push`
  // keeps the browser back stack clean while picking.
  const syncUrl = useCallback(
    (a: string | null, b: string | null) => {
      const params = new URLSearchParams();
      if (a) params.set('a', a);
      if (b) params.set('b', b);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const onPickA = (id: string | null) => {
    // Disallow picking the same audit on both sides — quietly swap
    // sides instead so the user doesn't have to clear the other slot.
    if (id && id === selectedB) {
      setSelectedB(selectedA);
      setSelectedA(id);
      syncUrl(id, selectedA);
      return;
    }
    setSelectedA(id);
    syncUrl(id, selectedB);
  };

  const onPickB = (id: string | null) => {
    if (id && id === selectedA) {
      setSelectedA(selectedB);
      setSelectedB(id);
      syncUrl(selectedB, id);
      return;
    }
    setSelectedB(id);
    syncUrl(selectedA, id);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
        <AuditSlot
          side="A"
          accentClass="text-accent-text"
          audit={auditA}
          audits={audits}
          excludeId={selectedB}
          onPick={onPickA}
          onClear={() => onPickA(null)}
        />
        <div className="hidden items-center justify-center md:flex">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-nativz-border bg-surface text-text-muted">
            <Swords size={16} />
          </span>
        </div>
        <AuditSlot
          side="B"
          accentClass="text-accent-text"
          audit={auditB}
          audits={audits}
          excludeId={selectedA}
          onPick={onPickB}
          onClear={() => onPickB(null)}
        />
      </div>

      {auditA && auditB ? (
        <VersusComparison auditA={auditA} auditB={auditB} />
      ) : (
        <div className="rounded-xl border border-dashed border-nativz-border bg-surface/40 p-10 text-center text-sm text-text-muted">
          {audits.length === 0 ? (
            <>
              No completed audits to compare yet. Run two audits and they&apos;ll show up here.
            </>
          ) : !auditA && !auditB ? (
            <>Pick two audits above to start the head-to-head.</>
          ) : (
            <>Pick one more audit to start the comparison.</>
          )}
        </div>
      )}
    </div>
  );
}

interface AuditSlotProps {
  side: 'A' | 'B';
  accentClass: string;
  audit: VersusAuditRow | null;
  audits: VersusAuditRow[];
  /** When set, this audit ID is filtered out of the picker so the user
   *  can't pick the same audit on both sides via the dropdown. (Manual
   *  re-pick of the other side is still handled by the swap logic in
   *  the parent so the toast-free UX feels right.) */
  excludeId: string | null;
  onPick: (id: string) => void;
  onClear: () => void;
}

function AuditSlot({ side, accentClass, audit, audits, excludeId, onPick, onClear }: AuditSlotProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = excludeId ? audits.filter((a) => a.id !== excludeId) : audits;
    if (!q) return list;
    return list.filter(
      (a) =>
        a.brand_name.toLowerCase().includes(q) ||
        (a.attached_client_name?.toLowerCase().includes(q) ?? false),
    );
  }, [audits, query, excludeId]);

  return (
    <div className="flex flex-col rounded-xl border border-nativz-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className={cn('font-mono text-[10px] uppercase tracking-[0.18em]', accentClass)}>
          Brand {side}
        </span>
        {audit ? (
          <button
            type="button"
            onClick={onClear}
            className="text-text-muted/70 hover:text-coral-300"
            aria-label={`Clear brand ${side}`}
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-1 items-center gap-3">
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent/10 text-accent-text">
          {audit?.favicon ? (
            <Image src={audit.favicon} alt="" width={48} height={48} sizes="48px" className="h-12 w-12 object-cover" />
          ) : (
            <Globe size={18} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          {audit ? (
            <>
              <div className="truncate font-display text-base font-semibold text-text-primary">
                {audit.brand_name}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-text-muted">
                {audit.attached_client_name ? (
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent-text">
                    {audit.attached_client_name}
                  </span>
                ) : null}
                <span>{audit.platforms.length} platform{audit.platforms.length === 1 ? '' : 's'}</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-text-muted">No audit selected</p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between"
              disabled={audits.length === 0}
            >
              <span>{audit ? 'Change audit' : 'Pick an audit'}</span>
              <ChevronDown size={14} />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={6}
            matchAnchorWidth
            className="border-nativz-border bg-surface p-0 text-text-primary shadow-[var(--shadow-dropdown)]"
          >
            <div className="border-b border-nativz-border p-3">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search audits…"
                  className="w-full rounded-lg border border-nativz-border bg-background py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-text-muted focus:border-accent focus:outline-none"
                  autoComplete="off"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto p-2" role="listbox" aria-label="Audits">
              {filtered.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-text-muted">
                  {audits.length === 0 ? 'No completed audits yet' : 'No matches'}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {filtered.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={a.id === audit?.id}
                        onClick={() => {
                          onPick(a.id);
                          setOpen(false);
                          setQuery('');
                        }}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-hover',
                          a.id === audit?.id && 'bg-accent/5',
                        )}
                      >
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-accent/10 text-accent-text">
                          {a.favicon ? (
                            <Image src={a.favicon} alt="" width={28} height={28} sizes="28px" className="h-7 w-7 object-cover" />
                          ) : (
                            <Globe size={12} />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-text-primary">{a.brand_name}</div>
                          <div className="truncate text-[10px] text-text-muted">
                            {a.attached_client_name ? `${a.attached_client_name} · ` : ''}
                            {a.platforms.length} platform{a.platforms.length === 1 ? '' : 's'}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
