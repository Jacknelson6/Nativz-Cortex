'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  Bell,
  Coins,
  Eye,
  IdCard,
  Plug,
  Users,
  Users2,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type RailItem = {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
  /** Group header rendered above this item. */
  groupHeader?: string;
};

const ITEMS: RailItem[] = [
  { key: 'overview', label: 'Overview', path: 'overview', icon: Eye, groupHeader: 'Brand' },
  { key: 'identity', label: 'Identity', path: 'identity', icon: IdCard },
  { key: 'assets', label: 'Assets', path: 'assets', icon: Archive },
  { key: 'users', label: 'Users', path: 'users', icon: Users, groupHeader: 'People' },
  { key: 'team', label: 'Team', path: 'team', icon: Users2 },
  { key: 'deliverables', label: 'Deliverables', path: 'deliverables', icon: Coins, groupHeader: 'Operations' },
  { key: 'notifications', label: 'Notifications', path: 'notifications', icon: Bell },
  { key: 'integrations', label: 'Integrations', path: 'integrations', icon: Plug },
];

function hrefFor(slug: string, path: string) {
  return `/admin/clients/${slug}/profile/${path}`;
}

function isActive(pathname: string | null, slug: string, path: string) {
  if (!pathname) return false;
  const href = hrefFor(slug, path);
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ProfileRail({ slug }: { slug: string }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {ITEMS.map((item) => {
        const href = hrefFor(slug, item.path);
        const active = isActive(pathname, slug, item.path);
        const Icon = item.icon;
        return (
          <li key={item.key}>
            {item.groupHeader && (
              <div className="px-3 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted/80">
                {item.groupHeader}
              </div>
            )}
            <Link
              href={href}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'bg-accent-surface text-text-primary font-semibold'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-primary font-medium',
              )}
            >
              <Icon size={14} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function ProfileMobileRail({ slug }: { slug: string }) {
  const pathname = usePathname();
  return (
    <div className="lg:hidden -mx-5 px-5 border-b border-nativz-border bg-background overflow-x-auto">
      <div className="flex gap-1 min-w-max py-2">
        {ITEMS.map((item) => {
          const href = hrefFor(slug, item.path);
          const active = isActive(pathname, slug, item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={href}
              className={cn(
                'inline-flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-accent-surface text-text-primary'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-primary',
              )}
            >
              <Icon size={13} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
