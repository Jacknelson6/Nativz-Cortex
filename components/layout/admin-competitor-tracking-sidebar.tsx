'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Megaphone, ShoppingBag, Facebook, Store, ChevronLeft } from 'lucide-react';

// ---------------------------------------------------------------------------
// Route matcher — which admin routes show the Competitor Tracking rail
// ---------------------------------------------------------------------------

const CT_PREFIXES = [
  // Organic Social keeps its legacy route so outbound share links
  // (/shared/analyze-social/[token]) keep working. Only the label changed.
  '/admin/analyze-social',
  '/admin/competitor-tracking',
];

export function isAdminCompetitorTrackingRoute(pathname: string): boolean {
  return CT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

interface CtItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  comingSoon?: boolean;
}

const ITEMS: CtItem[] = [
  { href: '/admin/analyze-social', label: 'Organic Social', icon: Users },
  { href: '/admin/competitor-tracking/meta-ads', label: 'Meta Ads', icon: Facebook },
  { href: '/admin/competitor-tracking/ecom', label: 'Ecom stores', icon: Store },
  { href: '/admin/competitor-tracking/social-ads', label: 'Social Ads (other)', icon: Megaphone, comingSoon: true },
  { href: '/admin/competitor-tracking/tiktok-shop', label: 'TikTok Shop', icon: ShoppingBag },
];

function isItemActive(pathname: string, item: CtItem): boolean {
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminCompetitorTrackingSidebar() {
  const pathname = usePathname();
  const active = isAdminCompetitorTrackingRoute(pathname);

  if (!active) return null;

  return (
    <aside
      aria-label="Competitor Spying navigation"
      className="sticky top-0 h-screen hidden md:flex flex-col shrink-0 border-r border-nativz-border bg-surface w-56"
    >
      <div className="shrink-0 p-3 pb-2">
        <Link
          href="/admin/dashboard"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-text-muted hover:text-text-secondary transition-colors mb-3"
        >
          <ChevronLeft size={14} />
          <span>Back to dashboard</span>
        </Link>
        <h2 className="px-1 text-lg font-semibold text-text-primary">Competitor Spying</h2>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-1">
        <ul className="flex flex-col gap-0.5">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = isItemActive(pathname, item);
            const base =
              'flex items-center gap-2.5 rounded-lg px-2.5 min-h-[40px] text-[15px] transition-colors';
            if (item.comingSoon) {
              return (
                <li key={item.href}>
                  <span
                    title="Coming soon"
                    className={`${base} text-text-muted opacity-50 cursor-not-allowed`}
                  >
                    <Icon size={18} className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                    <span className="ml-auto rounded-full border border-nativz-border bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                      Soon
                    </span>
                  </span>
                </li>
              );
            }
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`${base} ${
                    isActive
                      ? 'bg-accent-surface text-text-primary font-semibold'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text-primary font-medium'
                  }`}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
