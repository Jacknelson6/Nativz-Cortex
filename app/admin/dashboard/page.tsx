import Link from 'next/link';
import {
  Search,
  Calendar,
  ArrowUpRight,
  Workflow,
} from 'lucide-react';
import { PageError } from '@/components/shared/page-error';
import { TodoWidget } from '@/components/dashboard/todo-widget';
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
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-surface">
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
        {/* Header — weekday highlighted with Nativz cyan underline signature */}
        <div>
          <h1 className="ui-page-title nz-highlight">
            Dashboard <span className="text-text-muted font-normal">·</span>{' '}
            <u>{weekday}</u>
          </h1>
          <p className="text-sm text-text-muted mt-0.5">{monthDay}</p>
        </div>

        {/* Quick actions — responsive: 1 col phone, 2 col tablet, 5 cols desktop */}
        <div className="grid grid-cols-1 gap-3 auto-rows-[140px] sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[1fr_1fr_1fr_1fr_minmax(200px,1.2fr)]">
          <BentoTile
            href="/admin/pipeline"
            icon={<Workflow size={20} className="text-accent-text" />}
            label="Monthly pipeline"
            description="Stages, shoots, and delivery"
          />
          <BentoTile
            href="/admin/scheduler"
            icon={<Calendar size={20} className="text-accent-text" />}
            label="Schedule content"
            description="Plan and publish content"
          />
          <BentoTile
            href="/admin/search/new"
            icon={<Search size={20} className="text-accent-text" />}
            label="Research topic"
            description="Social listening and trends"
          />
          {/* Spacer under sm/lg to balance grid before Nerd tile */}
          <div className="hidden sm:block lg:hidden" aria-hidden />
          {/* Nerd tile — own component, nerdy instrument instead of AI glow */}
          <NerdTile className="col-span-1 sm:col-span-2 lg:col-span-1 xl:col-span-1" />
        </div>

        {/* Tasks + notifications — stacks on phone, side-by-side on tablet+ */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 items-stretch min-h-0">
          <div className="flex h-full min-h-0 flex-col">
            <TodoWidget />
          </div>
          <div className="flex h-full min-h-0 flex-col">
            <NotificationsWidget />
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('AdminDashboardPage error:', error);
    return <PageError />;
  }
}
