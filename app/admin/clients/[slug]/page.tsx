import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Settings, Search, Clock, Lightbulb, User2, Mail, Globe } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getVaultClientBySlug } from '@/lib/vault/reader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { formatRelativeTime } from '@/lib/utils/format';
import { InviteButton } from '@/components/clients/invite-button';
import { ClientStrategyCard } from '@/components/clients/client-strategy-card';
import type { ClientStrategy } from '@/lib/types/strategy';

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  try {
    // Read brand data from the vault (source of truth)
    const vaultProfile = await getVaultClientBySlug(slug);
    if (!vaultProfile) {
      notFound();
    }

    const adminClient = createAdminClient();

    // Check if this client has a Supabase record (for operational data)
    const { data: dbClient } = await adminClient
      .from('clients')
      .select('id, organization_id, logo_url, is_active, feature_flags')
      .eq('slug', slug)
      .maybeSingle();

    // Fetch searches, ideas, and contacts if we have a DB record
    const clientId = dbClient?.id;

    const [{ data: searches }, { data: recentIdeas }, { count: ideaCount }, { data: contacts }, { data: strategyData }] = await Promise.all([
      clientId
        ? adminClient
            .from('topic_searches')
            .select('id, query, status, created_at, approved_at')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] as Array<{ id: string; query: string; status: string; created_at: string; approved_at: string | null }> }),
      clientId
        ? adminClient
            .from('idea_submissions')
            .select('id, title, category, status, created_at, submitted_by')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] as Array<{ id: string; title: string; category: string; status: string; created_at: string; submitted_by: string | null }> }),
      clientId
        ? adminClient
            .from('idea_submissions')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', clientId)
            .in('status', ['new', 'reviewed'])
        : Promise.resolve({ count: 0 }),
      dbClient?.organization_id
        ? adminClient
            .from('users')
            .select('id, full_name, email, avatar_url, job_title, last_login')
            .eq('organization_id', dbClient.organization_id)
            .eq('role', 'viewer')
            .order('full_name')
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; email: string; avatar_url: string | null; job_title: string | null; last_login: string | null }> }),
      clientId
        ? adminClient
            .from('client_strategies')
            .select('*')
            .eq('client_id', clientId)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null as ClientStrategy | null }),
    ]);

    const items = searches || [];
    const ideas = recentIdeas || [];
    const clientContacts = contacts || [];
    const existingStrategy = (strategyData as ClientStrategy) ?? null;

    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/admin/clients" className="shrink-0 text-text-muted hover:text-text-secondary transition-colors">
              <ArrowLeft size={20} />
            </Link>
            {dbClient?.logo_url && (
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-nativz-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dbClient.logo_url} alt={vaultProfile.name} className="h-full w-full object-cover" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-2xl font-semibold text-text-primary">{vaultProfile.name}</h1>
                {vaultProfile.abbreviation && <Badge className="shrink-0">{vaultProfile.abbreviation}</Badge>}
              </div>
              <p className="truncate text-sm text-text-muted">{vaultProfile.industry || 'General'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href={`/admin/clients/${slug}/settings`}>
              <Button variant="outline" size="sm">
                <Settings size={14} />
                Settings
              </Button>
            </Link>
          </div>
        </div>

        {/* Brand profile + Point of contact — side by side */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Brand profile — from vault */}
          <Card>
            <h2 className="text-base font-semibold text-text-primary mb-4">Brand profile</h2>
            <div className="space-y-4">
              {vaultProfile.website_url && (
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Website</p>
                  <a href={vaultProfile.website_url} target="_blank" rel="noopener noreferrer" className="mt-1 text-sm text-accent-text hover:underline flex items-center gap-1">
                    <Globe size={12} />
                    {vaultProfile.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Target audience</p>
                <p className="mt-1 text-sm text-text-primary">{vaultProfile.target_audience || 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Brand voice</p>
                <p className="mt-1 text-sm text-text-primary">{vaultProfile.brand_voice || 'Not set'}</p>
              </div>
              {vaultProfile.topic_keywords.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Topic keywords</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {vaultProfile.topic_keywords.map((kw) => (
                      <Badge key={kw} variant="default">{kw}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {vaultProfile.services.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Services</p>
                  <p className="mt-1 text-sm text-text-primary">{vaultProfile.services.join(' · ')}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Point of contact — vault POC + portal users */}
          <Card>
            <h2 className="text-base font-semibold text-text-primary mb-4">Point of contact</h2>
            {/* Vault POC (from Monday.com) */}
            {vaultProfile.point_of_contact && (
              <div className="flex items-center gap-3 rounded-lg border border-nativz-border-light px-4 py-3 mb-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface text-accent-text">
                  <User2 size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary truncate">{vaultProfile.point_of_contact.name}</p>
                  <p className="text-xs text-text-muted flex items-center gap-1 truncate">
                    <Mail size={10} className="shrink-0" />
                    {vaultProfile.point_of_contact.email}
                  </p>
                </div>
                <a href={`mailto:${vaultProfile.point_of_contact.email}`}>
                  <Badge variant="default" className="cursor-pointer hover:bg-accent-surface/80 transition-colors flex items-center gap-1.5">
                    <Mail size={10} />
                    Contact
                  </Badge>
                </a>
              </div>
            )}
            {/* Portal users from Supabase */}
            {clientContacts.length === 0 && !vaultProfile.point_of_contact ? (
              <EmptyState
                icon={<User2 size={24} />}
                title="No contacts yet"
                description={`When ${vaultProfile.name} creates a portal account, they'll appear here.`}
              />
            ) : (
              <div className="space-y-3">
                {clientContacts.map((contact) => (
                  <div key={contact.id} className="flex items-center gap-3 rounded-lg border border-nativz-border-light px-4 py-3">
                    {contact.avatar_url ? (
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={contact.avatar_url} alt={contact.full_name} className="h-full w-full object-cover scale-125" />
                      </div>
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface text-accent-text">
                        <User2 size={16} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary truncate">{contact.full_name}</p>
                      {contact.job_title && (
                        <p className="text-xs text-text-muted truncate">{contact.job_title}</p>
                      )}
                      <p className="text-xs text-text-muted flex items-center gap-1 truncate">
                        <Mail size={10} className="shrink-0" />
                        {contact.email}
                      </p>
                    </div>
                    {contact.last_login && (
                      <span className="text-xs text-text-muted shrink-0">
                        Active {formatRelativeTime(contact.last_login)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Invite button */}
            {clientId && (
              <div className="mt-4">
                <InviteButton clientId={clientId} clientName={vaultProfile.name} />
              </div>
            )}
          </Card>
        </div>

        {/* Content strategy */}
        {clientId && (
          <ClientStrategyCard
            clientId={clientId}
            clientName={vaultProfile.name}
            initialStrategy={existingStrategy}
          />
        )}

        {/* Saved ideas */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-text-primary">Saved ideas</h2>
            <Link href={`/admin/clients/${slug}/ideas`}>
              <Button size="sm">
                <Lightbulb size={14} />
                View all
                {(ideaCount ?? 0) > 0 && (
                  <Badge variant="info" className="ml-1">{ideaCount}</Badge>
                )}
              </Button>
            </Link>
          </div>

          {ideas.length === 0 ? (
            <EmptyState
              icon={<Lightbulb size={24} />}
              title="No ideas yet"
              description={`Ideas submitted by ${vaultProfile.name} or your team will appear here.`}
            />
          ) : (
            <div className="space-y-2">
              {ideas.map((idea) => (
                <Link key={idea.id} href={`/admin/clients/${slug}/ideas`}>
                  <div className="flex items-center justify-between rounded-lg border border-nativz-border-light px-4 py-3 hover:bg-surface-hover transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{idea.title}</p>
                      <span className="text-xs text-text-muted flex items-center gap-1">
                        <Clock size={10} />
                        {formatRelativeTime(idea.created_at)}
                      </span>
                    </div>
                    <Badge variant={idea.status === 'new' ? 'info' : idea.status === 'accepted' ? 'success' : 'default'}>
                      {idea.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Recent searches */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-text-primary">Recent searches</h2>
            <Link href={`/admin/search/new?client=${clientId || slug}`}>
              <Button size="sm">
                <Search size={14} />
                New search
              </Button>
            </Link>
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={<Search size={24} />}
              title="No searches yet"
              description={`Run a search for ${vaultProfile.name} to get started.`}
            />
          ) : (
            <div className="space-y-2">
              {items.map((search) => (
                <Link key={search.id} href={`/admin/search/${search.id}`}>
                  <div className="flex items-center justify-between rounded-lg border border-nativz-border-light px-4 py-3 hover:bg-surface-hover transition-colors">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{search.query}</p>
                      <span className="text-xs text-text-muted flex items-center gap-1">
                        <Clock size={10} />
                        {formatRelativeTime(search.created_at)}
                      </span>
                    </div>
                    {search.approved_at ? (
                      <Badge variant="success">Sent</Badge>
                    ) : search.status === 'completed' ? (
                      <Badge variant="warning">Not sent</Badge>
                    ) : (
                      <Badge>{search.status}</Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  } catch (error) {
    console.error('AdminClientDetailPage error:', error);
    return <PageError />;
  }
}
