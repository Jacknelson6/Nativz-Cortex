import Link from 'next/link';
import {
  Search,
  Microscope,
  Calendar,
  Sparkles,
  BotMessageSquare,
  ArrowUpRight,
} from 'lucide-react';
import { PageError } from '@/components/shared/page-error';
import { TodoWidget } from '@/components/dashboard/todo-widget';
import { NotificationsWidget } from '@/components/dashboard/notifications-widget';
import { PipelineWidget } from '@/components/dashboard/pipeline-widget';

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
      <div className="relative h-full overflow-hidden rounded-2xl border border-nativz-border/60 bg-surface transition-all duration-300 hover:shadow-card-hover hover:-translate-y-0.5 hover:border-nativz-border">
        {/* Subtle gradient glow */}
        <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-accent opacity-[0.07] blur-3xl transition-opacity duration-500 group-hover:opacity-[0.14]" />
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

    return (
      <div className="cortex-page-gutter space-y-5">
        {/* Header */}
        <div>
          <h1 className="ui-page-title">Dashboard</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_minmax(200px,1.2fr)] gap-3 auto-rows-[140px]">
          <BentoTile
            href="/admin/analysis"
            icon={<Microscope size={20} className="text-accent-text" />}
            label="Analyze video"
            description="AI-powered video breakdown"
          />
          <BentoTile
            href="/admin/scheduler"
            icon={<Calendar size={20} className="text-accent-text" />}
            label="Schedule content"
            description="Plan and publish content"
          />
          <BentoTile
            href="/admin/ideas"
            icon={<Sparkles size={20} className="text-accent-text" />}
            label="Generate strategy"
            description="Content ideas and scripts"
          />
          <BentoTile
            href="/admin/search/new"
            icon={<Search size={20} className="text-accent-text" />}
            label="Research topic"
            description="Social listening and trends"
          />
          {/* The Nerd — special AI agent block */}
          <Link href="/admin/nerd" className="group block">
            <div className="relative h-full overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/[0.08] via-surface to-blue-500/[0.06] transition-all duration-300 hover:shadow-[0_0_30px_var(--focus-ring)] hover:-translate-y-0.5 hover:border-accent/50">
              {/* Animated gradient orbs */}
              <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-accent/10 blur-2xl transition-all duration-700 group-hover:bg-accent/20 group-hover:scale-125" />
              <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl transition-all duration-700 group-hover:bg-blue-500/15 group-hover:scale-110" />
              <div className="relative flex h-full flex-col justify-between p-5">
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 ring-1 ring-accent/20">
                    <BotMessageSquare size={20} className="text-accent-text" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                    </span>
                    <span className="text-[10px] font-medium text-accent-text/80 uppercase tracking-wider">AI</span>
                  </div>
                </div>
                <div className="mt-auto pt-4">
                  <h3 className="text-sm font-semibold text-text-primary">Talk to the Nerd</h3>
                  <p className="text-xs text-text-muted mt-0.5">Your AI agent with full Cortex access</p>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Tasks + Notifications — equal row height so task footer pins to bottom */}
        <div className="grid grid-cols-2 gap-3 items-stretch min-h-0">
          <div className="flex h-full min-h-0 flex-col">
            <TodoWidget />
          </div>
          <div className="flex h-full min-h-0 flex-col">
            <NotificationsWidget />
          </div>
        </div>

        {/* Pipeline quick-view */}
        <div className="grid grid-cols-1 gap-3">
          <PipelineWidget />
        </div>
      </div>
    );
  } catch (error) {
    console.error('AdminDashboardPage error:', error);
    return <PageError />;
  }
}
