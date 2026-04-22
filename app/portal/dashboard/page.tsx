import Link from 'next/link';
import { Search, FileText, Clock, ArrowRight, Database } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { StatCard } from '@/components/shared/stat-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageError } from '@/components/shared/page-error';
import { formatRelativeTime } from '@/lib/utils/format';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { PortalStrategyCard } from '@/components/portal/portal-strategy-card';

export const dynamic = 'force-dynamic';

type RecentReport = {
  id: string;
  query: string;
  status: string | null;
  created_at: string;
  approved_at: string | null;
  research_sources: unknown;
  subtopics: unknown;
};

// Proof-of-work: pull a source count + first subtopic off each report so
// the portal row signals "we did the reading" without the client opening
// the report. Both fields are llm_v1 pipeline output (migration 071); old
// rows will simply show without the secondary line.
function countSources(research: unknown): number {
  if (!research) return 0;
  if (Array.isArray(research)) return research.length;
  if (typeof research === 'object') {
    const bag = research as Record<string, unknown>;
    const merged = bag.sources ?? bag.deduped ?? bag.items;
    if (Array.isArray(merged)) return merged.length;
  }
  return 0;
}

function firstSubtopic(subtopics: unknown): string | null {
  if (!subtopics) return null;
  if (Array.isArray(subtopics)) {
    const first = subtopics[0];
    if (typeof first === 'string' && first.trim()) return first.trim();
    if (first && typeof first === 'object') {
      const label = (first as { title?: string; label?: string; topic?: string }).title
        ?? (first as { label?: string }).label
        ?? (first as { topic?: string }).topic;
      if (label && typeof label === 'string') return label.trim();
    }
  }
  return null;
}

export default async function PortalDashboardPage() {
  try {
    const result = await getPortalClient();

    if (!result) return null;

    const adminClient = createAdminClient();

    // Get user's name
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    let fullName = '';
    if (user) {
      const { data: userData } = await adminClient
        .from('users')
        .select('full_name')
        .eq('id', user.id)
        .single();
      fullName = userData?.full_name || '';
    }

    const { client, organizationId: _organizationId } = result;
    void _organizationId;
    const canSearch = client.feature_flags.can_search;
    const canViewReports = client.feature_flags.can_view_reports;

    // BUG 6: Scope to user's assigned client only — do not show other org clients' data
    const clientIds = [client.id];
    const clientName = client.name || 'your company';

    // Fetch stats + recent reports + rolled-up source count (proof-of-work).
    const [reportsResult, recentResult, totalSourcesResult] = await Promise.all([
      canViewReports && clientIds.length > 0
        ? adminClient.from('topic_searches')
            .select('id', { count: 'exact', head: true })
            .in('client_id', clientIds)
            .not('approved_at', 'is', null)
        : Promise.resolve({ count: 0 }),
      canViewReports && clientIds.length > 0
        ? adminClient.from('topic_searches')
            .select('id, query, status, created_at, approved_at, research_sources, subtopics')
            .in('client_id', clientIds)
            .not('approved_at', 'is', null)
            .order('created_at', { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] as RecentReport[] }),
      canViewReports && clientIds.length > 0
        ? adminClient.from('topic_searches')
            .select('research_sources')
            .in('client_id', clientIds)
            .not('approved_at', 'is', null)
        : Promise.resolve({ data: [] as Array<{ research_sources: unknown }> }),
    ]);

    const totalReports = reportsResult.count || 0;
    const recentReports: RecentReport[] = ('data' in recentResult ? recentResult.data as RecentReport[] : []) || [];
    const totalSources = (('data' in totalSourcesResult ? totalSourcesResult.data : []) || [])
      .reduce<number>((acc, row) => acc + countSources(row.research_sources), 0);

    const firstName = fullName ? fullName.split(' ')[0] : '';

    return (
      <div className="cortex-page-gutter space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="ui-page-title nz-highlight">
              Welcome back{firstName ? <> , <u>{firstName}</u></> : ''}
            </h1>
            <p className="text-sm text-text-muted">{clientName}</p>
          </div>
          {canSearch && (
            <Link href="/portal/search/new">
              <Button>
                <Search size={16} />
                New search
              </Button>
            </Link>
          )}
        </div>

        {/* Stats — adds a third "Sources consulted" tile so the client sees
            the depth of research behind every report without clicking in. */}
        {canViewReports && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title="Reports"
              value={String(totalReports)}
              icon={<FileText size={20} />}
            />
            <StatCard
              title="Sources consulted"
              value={totalSources > 0 ? totalSources.toLocaleString() : '—'}
              subtitle={totalSources > 0 ? 'Across all reports' : undefined}
              icon={<Database size={20} />}
            />
            <StatCard
              title="Recent activity"
              value={recentReports.length > 0 ? formatRelativeTime(recentReports[0].created_at) : 'No activity'}
              icon={<Clock size={20} />}
            />
          </div>
        )}

        {/* Content strategy */}
        <PortalStrategyCard clientId={client.id} clientName={client.name} />

        {/* Recent reports */}
        {canViewReports && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-text-primary">Recent reports</h2>
              <Link href="/portal/reports" className="text-sm text-accent-text hover:text-accent-hover flex items-center gap-1">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            {recentReports.length === 0 ? (
              <p className="text-sm text-text-muted py-4 text-center">
                No reports yet. Completed searches will appear here.
              </p>
            ) : (
              <div className="space-y-2">
                {recentReports.map((report) => {
                  const sources = countSources(report.research_sources);
                  const sample = firstSubtopic(report.subtopics);
                  return (
                    <Link key={report.id} href={`/portal/search/${report.id}`}>
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-nativz-border-light px-4 py-3 hover:bg-surface-hover transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text-primary truncate">{report.query}</p>
                          {/* Proof-of-work row — source count + optional sample topic.
                              Falls back to only relative time on pre-llm_v1 rows. */}
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
                            <span className="inline-flex items-center gap-1">
                              <Clock size={10} />
                              {formatRelativeTime(report.created_at)}
                            </span>
                            {sources > 0 ? (
                              <>
                                <span aria-hidden>·</span>
                                <span className="inline-flex items-center gap-1 tabular-nums">
                                  <Database size={10} />
                                  {sources} {sources === 1 ? 'source' : 'sources'}
                                </span>
                              </>
                            ) : null}
                            {sample ? (
                              <>
                                <span aria-hidden>·</span>
                                <span className="truncate">&ldquo;{sample}&rdquo;</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                        <Badge variant="success">Ready</Badge>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        )}
      </div>
    );
  } catch (error) {
    console.error('PortalDashboardPage error:', error);
    return <PageError />;
  }
}
