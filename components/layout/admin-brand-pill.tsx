'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ChevronsUpDown, User } from 'lucide-react';
import { useActiveBrand } from '@/lib/admin/active-client-context';
import type { AdminBrand } from '@/lib/admin/get-active-client';

/**
 * Top-of-bar brand pill. Clicking navigates to `/admin/select-brand` — the
 * full-page portfolio grid (components/ui/client-portfolio-selector.tsx)
 * handles the actual pick. Everything client-list-related lives over there
 * so the layout doesn't pay a roster query on every admin request.
 *
 * The pill itself just displays the currently-active brand (seeded from
 * the server cookie) and dims on admin-only routes to signal "brand
 * context is paused here."
 */

// Admin-only route prefixes — the pill dims on these routes because they
// don't read the active brand. Keep in sync with the "Admin" dropdown
// contents in admin-sidebar.tsx.
const ADMIN_ONLY_PREFIXES = [
  '/admin/dashboard',
  '/admin/tasks',
  '/admin/pipeline',
  '/admin/shoots',
  '/admin/scheduler',
  '/admin/accounting',
  '/admin/clients',
  '/admin/team',
  '/admin/users',
  '/admin/notifications',
  '/admin/tools',
  '/admin/nerd',
  '/admin/presentations',
  '/admin/settings',
  '/admin/integrations',
  '/admin/select-brand',
];

function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function AdminBrandPill() {
  const { brand, isPending } = useActiveBrand();
  const pathname = usePathname();
  const isMuted = isAdminOnlyPath(pathname);

  const triggerLabel = brand?.name ?? 'Select a brand';
  // Pass the current route so the selector page can send the user back
  // after a pick. Skip when the current page IS the selector (avoids a
  // redirect loop on accidental self-nav).
  const returnTo = pathname.startsWith('/admin/select-brand') ? '/admin/dashboard' : pathname;
  const href = `/admin/select-brand?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <Link
      href={href}
      title={isMuted ? 'Brand context not used here' : triggerLabel}
      className={`group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 transition-all duration-150 hover:border-nativz-border hover:bg-surface-hover ${
        isMuted ? 'opacity-60' : ''
      } ${isPending ? 'opacity-70' : ''}`}
    >
      <BrandIcon brand={brand} />
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium text-text-primary">{triggerLabel}</p>
      </div>
      <ChevronsUpDown size={14} className="shrink-0 text-text-muted" />
    </Link>
  );
}

function BrandIcon({ brand }: { brand: AdminBrand | null }) {
  const size = 20;

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

  if (brand) {
    const initial = brand.name.charAt(0).toUpperCase();
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-md bg-accent-surface"
        style={{ width: size, height: size, fontSize: size * 0.5 }}
      >
        <span className="font-semibold leading-none text-accent-text">{initial}</span>
      </div>
    );
  }

  // Empty state — no brand selected
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-md border border-dashed border-nativz-border text-text-muted"
      style={{ width: size, height: size }}
    >
      <User size={12} />
    </div>
  );
}
