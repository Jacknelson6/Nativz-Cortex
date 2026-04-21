'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Check, ChevronsUpDown, Plus, Search } from 'lucide-react';
import { useActiveBrand } from '@/lib/admin/active-client-context';
import type { AdminBrand } from '@/lib/admin/get-active-client';

/**
 * Top-of-sidebar brand pill. Drives the admin's current working brand — every
 * client-scoped tool reads this via `useActiveBrand()` on the client or
 * `getActiveAdminClient()` on the server.
 *
 * Routes that are admin-only (team, accounting, etc.) still render the pill
 * but dim it + change the tooltip — you can still switch brands preemptively
 * from those pages so the next tool you hit already has context set.
 */

// Admin-only route prefixes — the brand pill dims on these routes because
// they don't read the active brand. Keep in sync with the "Admin" section
// of NAV_SECTIONS in admin-sidebar.tsx AND the admin-only list in
// docs/spec-top-level-brand-selector.md.
//
// Brain (/admin/knowledge) lives under "Brand tools" now, so it's intentionally
// NOT listed here — Brain reads the active brand.
const ADMIN_ONLY_PREFIXES = [
  '/admin/dashboard',
  '/admin/tasks',
  '/admin/pipeline',
  '/admin/shoots',
  '/admin/scheduler',
  '/admin/accounting',
  '/admin/clients',
  '/admin/team',
  '/admin/tools',
  '/admin/nerd',
  '/admin/presentations',
  '/admin/notes',
  '/admin/settings',
  '/admin/integrations',
];

function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Recently-opened ordering. Stored as a small list of brand ids in
// localStorage, most-recent first, capped to keep writes cheap. Used by the
// pill dropdown to surface the brands the admin actually works on at the top
// of the list. Per-browser, not per-user in DB — simpler + private enough.
const RECENT_BRANDS_KEY = 'cortex.admin.recent-brands';
const RECENT_BRANDS_CAP = 12;

function readRecentBrandIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_BRANDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function rememberRecentBrand(id: string) {
  if (typeof window === 'undefined') return;
  try {
    const current = readRecentBrandIds().filter((existing) => existing !== id);
    const next = [id, ...current].slice(0, RECENT_BRANDS_CAP);
    window.localStorage.setItem(RECENT_BRANDS_KEY, JSON.stringify(next));
  } catch {
    /* localStorage unavailable — silently skip; pill still works, just no memory */
  }
}

interface AdminBrandPillProps {
  /** When true, render the icon-only collapsed variant. */
  collapsed?: boolean;
}

export function AdminBrandPill({ collapsed = false }: AdminBrandPillProps) {
  const { brand, availableBrands, setBrand, isPending } = useActiveBrand();
  const pathname = usePathname();
  const isMuted = isAdminOnlyPath(pathname);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Recency cache — seeded from localStorage on mount. Re-reads when the pill
  // opens so other tabs' activity is visible without a full reload.
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sort the full brand list: recently-opened (in recorded order) first,
  // then everything else alphabetically. The active brand bubbles above
  // recents — it's the one the user is on right now.
  const orderedBrands = useMemo(() => {
    const byId = new Map(availableBrands.map((b) => [b.id, b] as const));
    const result: AdminBrand[] = [];
    const seen = new Set<string>();

    if (brand && byId.has(brand.id)) {
      result.push(brand);
      seen.add(brand.id);
    }
    for (const id of recentIds) {
      if (seen.has(id)) continue;
      const b = byId.get(id);
      if (!b) continue;
      result.push(b);
      seen.add(id);
    }
    for (const b of availableBrands) {
      if (seen.has(b.id)) continue;
      result.push(b);
      seen.add(b.id);
    }
    return result;
  }, [availableBrands, recentIds, brand]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orderedBrands;
    return orderedBrands.filter((b) => b.name.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q));
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
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Keyboard shortcut intentionally NOT claimed — `SidebarProvider` already
  // binds ⌘B to toggle the rail (sidebar.tsx), and ⌘K is reserved for the
  // app command palette. Adding another global chord here is more confusing
  // than useful. Click the pill or hit the search via the command palette.

  // Focus search when popover opens, and refresh the recency list so a
  // brand opened in another tab bubbles up here without needing a reload.
  useEffect(() => {
    if (open) {
      setRecentIds(readRecentBrandIds());
      // defer a tick so the element exists
      const id = requestAnimationFrame(() => searchInputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    setQuery('');
  }, [open]);

  // Seed recency once on mount so the ordered list matches localStorage on
  // first render even before the popover opens.
  useEffect(() => {
    setRecentIds(readRecentBrandIds());
  }, []);

  // Whenever the context's active brand changes (including from cookie on
  // first load or a URL-driven SyncActiveBrand), stamp it as most recent.
  useEffect(() => {
    if (brand?.id) {
      rememberRecentBrand(brand.id);
      setRecentIds(readRecentBrandIds());
    }
  }, [brand?.id]);

  const handlePick = useCallback(
    (brandId: string) => {
      rememberRecentBrand(brandId);
      setRecentIds(readRecentBrandIds());
      setBrand(brandId);
      setOpen(false);
    },
    [setBrand],
  );

  const triggerLabel = brand?.name ?? 'Select a brand';

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={isMuted ? 'Brand context not used here' : triggerLabel}
        className={`group flex w-full items-center rounded-lg border transition-all duration-150 ${
          collapsed ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'
        } ${
          open
            ? 'border-accent/30 bg-accent-surface/30'
            : 'border-transparent hover:border-nativz-border hover:bg-surface-hover'
        } ${isMuted ? 'opacity-60' : ''} ${isPending ? 'opacity-70' : ''}`}
      >
        <BrandIcon brand={brand} size={collapsed ? 24 : 20} />
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium text-text-primary">{triggerLabel}</p>
            </div>
            <ChevronsUpDown size={14} className="shrink-0 text-text-muted" />
          </>
        )}
      </button>

      {open && (
        <div
          className={`absolute z-50 rounded-xl border border-nativz-border bg-surface shadow-elevated animate-[sidebarTooltipIn_120ms_ease-out_forwards] ${
            collapsed
              ? 'left-full ml-2 top-0 w-[280px]'
              : 'top-full mt-1.5 left-0 right-0 min-w-[240px]'
          }`}
          style={{ backdropFilter: 'blur(16px)' }}
          role="listbox"
          aria-label="Brand switcher"
        >
          {/* Search */}
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
                    <BrandIcon brand={b} size={20} />
                    <span className="min-w-0 flex-1 truncate text-left">{b.name}</span>
                    {isActive && <Check size={14} className="shrink-0 text-accent-text" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-nativz-border p-1">
            <Link
              href="/admin/clients"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              <span className="flex-1">All brands</span>
            </Link>
            <Link
              href="/admin/clients/onboard"
              onClick={() => setOpen(false)}
              className="mt-0.5 flex w-full items-center gap-2 rounded-lg bg-accent px-2.5 py-2 text-sm font-semibold text-white hover:bg-accent/90"
            >
              <Plus size={14} className="shrink-0" />
              <span className="flex-1 text-left">Onboard client</span>
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
        unoptimized
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
