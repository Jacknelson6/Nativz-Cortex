import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  BookOpen,
  Palette,
  Dna,
  Settings2,
  StickyNote,
} from 'lucide-react';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { AgencyAssignmentLabel } from '@/components/clients/agency-assignment-label';
import { ImpersonateButton } from '@/components/clients/impersonate-button';
import { InviteButton } from '@/components/clients/invite-button';
import { OverviewAnalytics } from '@/components/clients/overview-analytics';
import { OverviewQuickFacts } from '@/components/clients/overview-quick-facts';
import { HealthScoreBadge } from '@/components/clients/health-score-badge';
import { ClientTasksCard } from '@/components/clients/client-tasks-card';
import { ClientTeamCard } from '@/components/clients/client-team-card';
import {
  isAdminWorkspaceNavVisible,
  type AdminWorkspaceToggleKey,
} from '@/lib/clients/admin-workspace-modules';

export type HealthScore = 'not_good' | 'fair' | 'good' | 'great' | 'excellent';

export interface ClientOverviewData {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  logo_url: string | null;
  website_url: string | null;
  agency: string | null;
  organization_id: string | null;
  health_score: HealthScore | null;
  target_audience: string | null;
  brand_voice: string | null;
  topic_keywords: string[];
  services: string[];
  monthly_boosting_budget: number | null;
  google_drive_branding_url: string | null;
  google_drive_calendars_url: string | null;
  admin_workspace_modules: Record<AdminWorkspaceToggleKey, boolean> | null;
}

export interface ClientOverviewProps {
  client: ClientOverviewData;
  /** Full-page workspace shell — hide back link and breadcrumbs since the sidebar provides them. */
  embeddedInShell?: boolean;
}

/**
 * Admin Client Overview — dashboard-first layout for account managers.
 * Server component: receives data as props and renders without client-side
 * fetches. Interactive children (buttons, analytics feed) are their own
 * client components and self-fetch where needed.
 */
export function ClientOverview({ client, embeddedInShell }: ClientOverviewProps) {
  const slug = client.slug;
  const showBreadcrumbs = !embeddedInShell;
  const showBackLink = !embeddedInShell;

  return (
    <div className="cortex-page-gutter space-y-8 max-w-5xl mx-auto">
      {showBreadcrumbs && (
        <Breadcrumbs items={[{ label: 'Clients', href: '/admin/clients' }, { label: client.name }]} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {showBackLink && (
            <Link
              href="/admin/clients"
              className="shrink-0 text-text-muted hover:text-text-secondary transition-colors mt-1"
            >
              <ArrowLeft size={20} />
            </Link>
          )}
          <ClientLogoTile name={client.name} logoUrl={client.logo_url} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="truncate ui-page-title">{client.name}</h1>
              <AgencyAssignmentLabel agency={client.agency} showWhenUnassigned className="shrink-0" />
              <HealthScoreBadge score={client.health_score} />
            </div>
            <p className="truncate text-sm text-text-muted mt-0.5">
              {client.industry || 'General'}
              {client.website_url && (
                <>
                  {' · '}
                  <a
                    href={client.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-text hover:underline inline-flex items-center gap-0.5"
                  >
                    {client.website_url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                    <ExternalLink size={10} />
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="shrink-0 pt-1 flex items-center gap-2">
          {client.organization_id && (
            <ImpersonateButton organizationId={client.organization_id} clientSlug={slug} />
          )}
          <InviteButton clientId={client.id} clientName={client.name} variant="compact" />
        </div>
      </div>

      <QuickNav slug={slug} modules={client.admin_workspace_modules} />

      {/* Analytics, pipeline, activity — self-fetches in a single summary call */}
      <OverviewAnalytics clientId={client.id} slug={slug} />

      {/* Operational cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ClientTasksCard clientId={client.id} clientName={client.name} />
        <ClientTeamCard clientId={client.id} clientName={client.name} />
      </div>

      {/* Demoted configuration summary */}
      <OverviewQuickFacts
        slug={slug}
        targetAudience={client.target_audience}
        brandVoice={client.brand_voice}
        topicKeywords={client.topic_keywords}
        services={client.services}
        monthlyBoostingBudget={client.monthly_boosting_budget}
        googleDriveBrandingUrl={client.google_drive_branding_url}
        googleDriveCalendarsUrl={client.google_drive_calendars_url}
      />
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function ClientLogoTile({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const abbreviation = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-hover/50 border border-nativz-border-light">
      {logoUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={logoUrl} alt={name} className="h-full w-full object-contain p-2" />
      ) : (
        <div className="text-lg font-bold text-accent-text">
          {abbreviation || <Building2 size={24} />}
        </div>
      )}
    </div>
  );
}

function QuickNav({
  slug,
  modules,
}: {
  slug: string;
  modules: Record<AdminWorkspaceToggleKey, boolean> | null;
}) {
  const items = (
    [
      { key: 'brand-dna', href: `/admin/clients/${slug}/brand-dna`, label: 'Brand DNA', Icon: Dna, variant: 'accent' as const },
      { key: 'moodboard', href: `/admin/clients/${slug}/moodboard`, label: 'Notes', Icon: StickyNote, variant: 'default' as const },
      { key: 'knowledge', href: `/admin/clients/${slug}/knowledge`, label: 'Knowledge', Icon: BookOpen, variant: 'default' as const },
      { key: 'ad-creatives', href: `/admin/clients/${slug}/ad-creatives`, label: 'Ad creatives', Icon: Palette, variant: 'default' as const },
      { key: 'settings', href: `/admin/clients/${slug}/settings`, label: 'Settings', Icon: Settings2, variant: 'default' as const },
    ] as const
  ).filter((item) => isAdminWorkspaceNavVisible(modules, item.key));

  return (
    <nav
      className="flex flex-wrap items-center gap-1 border-b border-nativz-border-light pb-3 -mt-2"
      aria-label="Client sections"
    >
      {items.map((item) => {
        const Icon = item.Icon;
        const className =
          item.variant === 'accent'
            ? 'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-accent-text bg-accent-surface/25 border border-accent-border/35 hover:bg-accent-surface/45 transition-colors'
            : 'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors';
        return (
          <Link key={item.key} href={item.href} className={className}>
            <Icon size={14} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
