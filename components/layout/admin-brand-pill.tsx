'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Check, ChevronsUpDown, FolderOpen, Plus, Search } from 'lucide-react';
import { useActiveBrand } from '@/lib/admin/active-client-context';
import type { AdminBrand } from '@/lib/active-brand';

/**
 * Top-bar brand pill. Clicking opens a compact popover with search + a list
 * of the admin's brands + quick links to the full roster and the onboarding
 * flow. Mirrors the RankPrompt pattern Jack referenced — in-place swap,
 * no navigation.
 *
 * The popover reuses the sidebar's `sidebarTooltipIn` keyframe for
 * consistency with the rest of the shell's reveal motion.
 */

// Admin-only route prefixes — the pill dims on these routes because they
// don't read the active brand. Keep in sync with the "Admin" dropdown
// contents in admin-sidebar.tsx.
const ADMIN_ONLY_PREFIXES = [
  '/admin/dashboard',
  '/admin/availability',
  '/admin/accounting',
  '/admin/clients',
  '/admin/team',
  '/admin/users',
  '/admin/tools',
  '/admin/nerd',
  '/admin/presentations',
  '/admin/settings',
  '/admin/integrations',
];

function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function AdminBrandPill() {
  const { brand, availableBrands, setBrand, isPending } = useActiveBrand();
  const pathname = usePathname();
  const isMuted = isAdminOnlyPath(pathname);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeDropBrandIds, setActiveDropBrandIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/calendar/drops/active-brands');
        if (!res.ok) return;
        const json = (await res.json()) as { brandIds?: string[] };
        if (!cancelled) setActiveDropBrandIds(new Set(json.brandIds ?? []));
      } catch {
        // Indicator is non-critical — failures are silently ignored.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Active brand first; everything else alphabetical underneath.
  const orderedBrands = useMemo(() => {
    if (!brand) return availableBrands;
    const others = availableBrands.filter((b) => b.id !== brand.id);
    const active = availableBrands.find((b) => b.id === brand.id);
    return active ? [active, ...others] : availableBrands;
  }, [availableBrands, brand]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orderedBrands;
    return orderedBrands.filter(
      (b) => b.name.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q),
    );
  }, [orderedBrands, query]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Focus the search field when the popover opens; clear the query when
  // it closes so the next open starts fresh.
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => searchInputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    setQuery('');
  }, [open]);

  const handlePick = useCallback(
    (brandId: string) => {
      setBrand(brandId);
      setOpen(false);
    },
    [setBrand],
  );

  const triggerLabel = brand?.name ?? 'Select a brand';
  const triggerHasActiveDrop = brand ? activeDropBrandIds.has(brand.id) : false;

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={isMuted ? 'Brand context not used here' : triggerLabel}
        className={`group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-all duration-150 ${
          open
            ? 'border-accent/30 bg-accent-surface/30'
            : 'border-transparent hover:border-nativz-border hover:bg-surface-hover'
        }`}
      >
        {/* Logo stays full brightness in every state — it's brand identity,
         *  not a control. Muting moves to the label + chevron only so
         *  admin-only routes still read as "brand context paused" without
         *  visually punishing the brand itself. */}
        <div className="relative shrink-0">
          <BrandIcon brand={brand} size={20} />
          {triggerHasActiveDrop && (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-background"
              title="Has an active content drop"
            />
          )}
        </div>
        <div
          className={`min-w-0 flex-1 text-left transition-opacity duration-150 ${
            isMuted ? 'opacity-60' : ''
          } ${isPending ? 'opacity-70' : ''}`}
        >
          <p className="truncate text-sm font-medium text-text-primary">{triggerLabel}</p>
        </div>
        <ChevronsUpDown
          size={14}
          className={`shrink-0 text-text-muted transition-opacity duration-150 ${
            isMuted ? 'opacity-60' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Brand switcher"
          className="absolute left-0 right-0 top-full z-50 mt-1.5 min-w-[280px] rounded-xl border border-nativz-border bg-surface shadow-elevated animate-[sidebarTooltipIn_120ms_ease-out_forwards]"
          style={{ backdropFilter: 'blur(16px)' }}
        >
          {/* Search — ⌘K hint is visual only; the global command palette
              already owns that chord, so we don't double-bind. */}
          <div className="flex items-center gap-2 border-b border-nativz-border px-2.5 py-2">
            <Search size={14} className="shrink-0 text-text-muted" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search brands..."
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            <kbd className="shrink-0 rounded border border-nativz-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
              ⌘K
            </kbd>
          </div>

          {/* Brand list */}
          <div className="max-h-[320px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2.5 py-4 text-center text-xs text-text-muted">
                {query ? 'No brands match' : 'No brands available yet'}
              </div>
            ) : (
              filtered.map((b) => {
                const isActive = brand?.id === b.id;
                const hasDrop = activeDropBrandIds.has(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handlePick(b.id)}
                    role="option"
                    aria-selected={isActive}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-accent-surface/50 text-accent-text'
                        : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <BrandIcon brand={b} size={20} />
                      {hasDrop && (
                        <span
                          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-surface"
                          title="Has an active content drop"
                        />
                      )}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-left">{b.name}</span>
                    {isActive && <Check size={14} className="shrink-0 text-accent-text" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer — "All brands" link + Onboard CTA */}
          <div className="border-t border-nativz-border p-1">
            <Link
              href="/admin/clients"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              <FolderOpen size={14} className="shrink-0" />
              <span className="flex-1">All brands</span>
            </Link>
            <Link
              href="/admin/clients/onboard"
              onClick={() => setOpen(false)}
              className="mt-0.5 flex w-full items-center gap-2 rounded-lg bg-accent px-2.5 py-2 text-sm font-semibold text-white hover:bg-accent/90"
            >
              <Plus size={14} className="shrink-0" />
              <span className="flex-1 text-left">Create brand</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function BrandIcon({ brand, size }: { brand: AdminBrand | null; size: number }) {
  if (brand?.logo_url) {
    return (
      <Image
        src={brand.logo_url}
        alt={brand.name}
        width={size}
        height={size}
        className="shrink-0 rounded-md object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  const initial = brand?.name.charAt(0).toUpperCase() ?? '?';
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-md bg-accent-surface"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      <span className="font-semibold leading-none text-accent-text">{initial}</span>
    </div>
  );
}
