import Link from 'next/link';
import {
  Search,
  UserPlus,
  BotMessageSquare,
  ArrowUpRight,
} from 'lucide-react';
import { PageError } from '@/components/shared/page-error';
import { TodoWidget } from '@/components/dashboard/todo-widget';
import { NotificationsWidget } from '@/components/dashboard/notifications-widget';

function BentoTile({
  href,
  icon,
  label,
  description,
  accentColor,
  className = '',
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  accentColor: string;
  className?: string;
}) {
  return (
    <Link href={href} className={`group block ${className}`}>
      <div className="relative h-full overflow-hidden rounded-2xl border border-nativz-border/60 bg-surface transition-all duration-300 hover:shadow-card-hover hover:-translate-y-0.5 hover:border-nativz-border">
        {/* Subtle gradient glow */}
        <div
          className="absolute -top-20 -right-20 h-40 w-40 rounded-full opacity-[0.07] blur-3xl transition-opacity duration-500 group-hover:opacity-[0.14]"
          style={{ background: accentColor }}
        />
        <div className="relative flex h-full flex-col justify-between p-5">
          <div className="flex items-start justify-between">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: `${accentColor}18` }}
            >
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
      <div className="p-6 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-3 auto-rows-[160px]">
          <BentoTile
            href="/admin/clients/onboard"
            icon={<UserPlus size={20} className="text-accent-text" />}
            label="Onboard client"
            description="Add a new client to Cortex"
            accentColor="#046bd2"
          />
          <BentoTile
            href="/admin/search/new"
            icon={<Search size={20} className="text-accent-text" />}
            label="Search for a topic"
            description="AI-powered topic research"
            accentColor="#046bd2"
          />
          <BentoTile
            href="/admin/nerd"
            icon={<BotMessageSquare size={20} style={{ color: '#a78bfa' }} />}
            label="Talk to the nerd"
            description="Ask anything about your data"
            accentColor="#8b5cf6"
          />
        </div>

        {/* Tasks + Notifications */}
        <div className="grid grid-cols-2 gap-3">
          <TodoWidget />
          <NotificationsWidget />
        </div>
      </div>
    );
  } catch (error) {
    console.error('AdminDashboardPage error:', error);
    return <PageError />;
  }
}
