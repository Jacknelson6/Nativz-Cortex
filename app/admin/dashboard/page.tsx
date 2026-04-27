import Link from 'next/link';
import {
  Search,
  Calendar,
  ArrowUpRight,
} from 'lucide-react';
import { PageError } from '@/components/shared/page-error';
import { NotificationsWidget } from '@/components/dashboard/notifications-widget';
import { NerdTile } from '@/components/dashboard/nerd-tile';

function BentoTile({
  href,
  icon,
  label,
  description,
  className = '',
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  className?: string;
}) {
  return (
    <Link href={href} className={`group block ${className}`}>
      <div className="relative h-full overflow-hidden rounded-2xl border border-nativz-border/60 bg-surface transition-all duration-300 hover:-translate-y-0.5 hover:border-nativz-border hover:shadow-[var(--shadow-card-hover)]">
        <div className="relative flex h-full flex-col justify-between p-5">
          <div className="flex items-start justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-surface ring-1 ring-inset ring-accent/20">
              {icon}
            </div>
            <ArrowUpRight
              size={16}
              className="text-text-muted/0 transition-all duration-300 group-hover:text-text-muted group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </div>
          <div className="mt-auto pt-6">
            <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
            <p className="text-xs text-text-muted mt-0.5">{description}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default async function AdminDashboardPage() {
  try {
    const now = new Date();
    const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
    const monthDay = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    return (
      <div className="cortex-page-gutter space-y-5">
        {/* Header — weekday highlighted with Nativz cyan underline signature.
            ⌘K hint surfaces the command palette so keyboard users discover
            the shortcut without hunting through the sidebar. */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="ui-page-title nz-highlight">
              Dashboard <span className="text-text-muted font-normal">·</span>{' '}
              <u>{weekday}</u>
            </h1>
            <p className="text-sm text-text-muted mt-0.5">{monthDay}</p>
          </div>
          <p className="hidden sm:inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-text-muted">
            <kbd className="inline-flex items-center rounded-md border border-nativz-border bg-surface-hover px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
              ⌘K
            </kbd>
            to search
          </p>
        </div>

        {/* Quick actions — responsive: 1 col phone, 2 col tablet,
            3-col (Nerd slightly wider) from lg up. */}
        <div className="grid grid-cols-1 gap-3 auto-rows-[140px] sm:grid-cols-2 lg:grid-cols-[1fr_1fr_minmax(220px,1.25fr)]">
          <BentoTile
            href="/admin/scheduling"
            icon={<Calendar size={20} className="text-accent-text" />}
            label="Schedule content"
            description="Plan and publish content"
          />
          <BentoTile
            href="/finder/new"
            icon={<Search size={20} className="text-accent-text" />}
            label="Research topic"
            description="Social listening and trends"
          />
          {/* Nerd tile — nerdy instrument instead of AI glow */}
          <NerdTile />
        </div>

        <div className="flex min-h-0 flex-col">
          <NotificationsWidget />
        </div>
      </div>
    );
  } catch (error) {
    console.error('AdminDashboardPage error:', error);
    return <PageError />;
  }
}
