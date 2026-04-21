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

// Admin-only route prefixes — these ignore the active brand value. Keep in
// sync with docs/spec-top-level-brand-selector.md "Admin-only (ignore
// selector)" section.
const ADMIN_ONLY_PREFIXES = [
  '/admin/dashboard',
  '/admin/tasks',
  '/admin/pipeline',
  '/admin/shoots',
  '/admin/scheduler',
  '/admin/accounting',
  '/admin/clients',
  '/admin/team',
  '/admin/knowledge',
  '/admin/nerd',
  '/admin/presentations',
  '/admin/notes',
  '/admin/settings',
  '/admin/integrations',
];

function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
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
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableBrands;
    return availableBrands.filter((b) => b.name.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q));
  }, [availableBrands, query]);

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

  // Focus search when popover opens
  useEffect(() => {
    if (open) {
      // defer a tick so the element exists
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
              href="/admin/clients?new=1"
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
