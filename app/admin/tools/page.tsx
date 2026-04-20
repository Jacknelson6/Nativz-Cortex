import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  Users as UsersIcon,
  Receipt,
  Megaphone,
  Shield,
  Clock3,
} from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Admin Tools hub — one place for every admin-only internal surface. First
 * increment of NAT-5: unified entry point while individual URLs keep
 * working. Secondary-rail layout, page moves, and the Comptroller/CEO
 * read-only payroll view are scoped as follow-ups.
 */
export default async function AdminToolsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const { data: userRow } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!userRow || !['admin', 'super_admin'].includes(userRow.role)) {
    redirect('/admin/dashboard');
  }

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
          Admin tools
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Internal-only surfaces. Individual URLs still work, this is just the unified hub.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ToolCard
          href="/admin/users"
          icon={UsersIcon}
          title="Users"
          blurb="Team members, roles, and portal access"
        />
        <ToolCard
          href="/admin/accounting"
          icon={Receipt}
          title="Accounting"
          blurb="Payroll periods, entries, and CSV export"
        />
        <ToolCard
          href="/admin/settings/production-updates"
          icon={Megaphone}
          title="Production updates"
          blurb="Mass branded email broadcasts, agency-aware"
        />
        <ToolCard
          title="Comptroller view"
          icon={Shield}
          blurb="Read-only payroll summary via link-token (coming soon)"
          comingSoon
        />
        <ToolCard
          title="Audit log"
          icon={Clock3}
          blurb="Who did what, when, across every admin surface (coming soon)"
          comingSoon
        />
      </section>
    </div>
  );
}

interface ToolCardProps {
  href?: string;
  title: string;
  blurb: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  comingSoon?: boolean;
}

function ToolCard({ href, title, blurb, icon: Icon, comingSoon }: ToolCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-surface text-accent-text">
          <Icon size={18} aria-hidden />
        </div>
        {comingSoon ? (
          <span className="rounded-full border border-nativz-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
            Soon
          </span>
        ) : (
          <ArrowRight
            size={16}
            aria-hidden
            className="text-text-muted transition-colors group-hover:text-accent-text"
          />
        )}
      </div>
      <div className="mt-4">
        <p className="text-base font-semibold text-text-primary">{title}</p>
        <p className="mt-1 text-sm text-text-secondary">{blurb}</p>
      </div>
    </>
  );

  if (comingSoon || !href) {
    return (
      <div className="rounded-2xl border border-dashed border-nativz-border bg-surface/30 p-5 opacity-70">
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group rounded-2xl border border-nativz-border bg-surface p-5 shadow-card transition hover:border-accent/40 hover:bg-surface-hover"
    >
      {body}
    </Link>
  );
}
