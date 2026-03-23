'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

export function ClientSettingsTabs({ slug }: { slug: string }) {
  const pathname = usePathname() ?? '';
  const base = `/admin/clients/${slug}/settings`;
  const isGeneral = pathname === base || pathname === `${base}/`;
  const isNotifications = pathname.startsWith(`${base}/notifications`);

  const tabClass = (active: boolean) =>
    cn(
      'inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      active
        ? 'bg-accent/10 text-accent-text'
        : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary',
    );

  return (
    <nav
      className="flex flex-wrap gap-1 border-b border-nativz-border pb-px mb-8"
      aria-label="Settings sections"
    >
      <Link href={base} className={tabClass(isGeneral)}>
        General
      </Link>
      <Link href={`${base}/notifications`} className={tabClass(isNotifications)}>
        Notifications
      </Link>
    </nav>
  );
}
