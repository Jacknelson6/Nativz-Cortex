'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Clock, FlaskConical } from 'lucide-react';
import { contentLabTopicSearchStorageKey } from '@/lib/content-lab/topic-search-selection-storage';
import { ContentLabAttachClientDialog } from '@/components/content-lab/content-lab-attach-client-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { ScrollProgress } from '@/components/ui/scroll-progress';
import { ExecutiveSummary } from '@/components/reports/executive-summary';
import { BrandApplication } from '@/components/reports/brand-application';
import { EmotionsBreakdown } from '@/components/results/emotions-breakdown';
import { ContentBreakdown } from '@/components/results/content-breakdown';
import { TrendingTopicsTable } from '@/components/results/trending-topics-table';
import { ContentPillars } from '@/components/results/content-pillars';
import { NicheInsights } from '@/components/results/niche-insights';
import { ActivityChart } from '@/components/charts/activity-chart';
import { ExportPdfButton } from '@/components/results/export-pdf-button';
import { ShareButton } from '@/components/results/share-button';
import { SearchProgress } from '@/components/search/search-progress';
import type { TopicSearch, TopicSearchAIResponse, TrendingTopic, LegacyTrendingTopic } from '@/lib/types/search';
import { ScrapedVideosSection } from '@/components/results/scraped-videos-section';
import { AiTakeaways } from '@/components/results/ai-takeaways';
import { useAgencyBrand } from '@/lib/agency/use-agency-brand';
import { TopicSyntheticAudiences } from '@/components/results/topic-synthetic-audiences';
import { getClientAbbreviationLabel } from '@/lib/clients/client-abbreviations';
import { formatRelativeTime } from '@/lib/utils/format';

interface AdminResultsClientProps {
  search: TopicSearch;
  clientInfo?: {
    id: string;
    name: string;
    slug: string;
    industry?: string;
    topic_keywords?: string[] | null;
  } | null;
  scrapedVideoCount?: number;
}

export function AdminResultsClient({
  search,
  clientInfo,
  scrapedVideoCount = 0,
}: AdminResultsClientProps) {
  const router = useRouter();
  const { brand: agencyBrand } = useAgencyBrand();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(search.query);
  const [savingTitle, setSavingTitle] = useState(false);
  const [attachDialogOpen, setAttachDialogOpen] = useState(false);
  const aiResponse = search.raw_ai_response as TopicSearchAIResponse | null;
  const trendingTopics = (search.trending_topics ?? []) as (TrendingTopic | LegacyTrendingTopic)[];

  useEffect(() => {
    setTitleDraft(search.query);
  }, [search.query]);

  function beginEditingTitle() {
    setTitleDraft(search.query);
    setEditingTitle(true);
  }

  async function saveTopicTitle() {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      toast.error('Topic name is required');
      return;
    }
    if (trimmed === search.query) {
      setEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    try {
      const res = await fetch(`/api/search/${search.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error || 'Could not update topic name');
        return;
      }
      toast.success('Topic name updated');
      setEditingTitle(false);
      router.refresh();
    } finally {
      setSavingTitle(false);
    }
  }

  if (search.status === 'processing' || search.status === 'pending') {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4">
        <p className="text-lg font-semibold text-text-primary mb-2">
          Researching &ldquo;{search.query}&rdquo;
        </p>
        <p className="text-sm text-text-muted mb-8">This usually takes 1-2 minutes</p>
        <SearchProgress />
      </div>
    );
  }

  if (search.status === 'failed') {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-4">
        <p className="text-sm text-red-400 mb-4">{search.summary || 'Search failed. Try again.'}</p>
        <Link href="/admin/finder/new">
          <Button variant="outline">New search</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <ScrollProgress />
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-nativz-border bg-surface/80 backdrop-blur-sm">
        <div className="flex flex-col gap-3 px-6 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Link
              href="/admin/finder/new"
              className="mt-1 shrink-0 text-text-muted hover:text-text-secondary transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <div className="min-w-0 flex-1 space-y-2">
              {editingTitle ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                  <input
                    autoFocus
                    maxLength={500}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setTitleDraft(search.query);
                        setEditingTitle(false);
                      }
                      if (e.key === 'Enter') void saveTopicTitle();
                    }}
                    aria-label="Topic search name"
                    className="block w-full min-w-0 flex-1 rounded-lg border border-nativz-border bg-background px-3 py-2 text-lg font-semibold leading-snug text-text-primary shadow-[var(--shadow-card)] focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-xl"
                  />
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button type="button" size="sm" disabled={savingTitle} onClick={() => void saveTopicTitle()}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={savingTitle}
                      onClick={() => {
                        setTitleDraft(search.query);
                        setEditingTitle(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <h1 className="min-w-0">
                  <button
                    type="button"
                    title="Click to edit"
                    onClick={beginEditingTitle}
                    className="w-full rounded-md px-1 py-0.5 text-left text-lg font-semibold leading-snug text-text-primary break-words [overflow-wrap:anywhere] transition-colors hover:bg-surface-hover/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:text-xl"
                  >
                    {search.query}
                  </button>
                </h1>
              )}
              {clientInfo ? (
                <Link
                  href={`/admin/clients/${clientInfo.slug}`}
                  title={clientInfo.name}
                  aria-label={`View client ${clientInfo.name}`}
                  className="inline-flex max-w-full"
                >
                  <Badge variant="info" className="gap-1.5 px-2.5 py-1 text-sm font-medium">
                    <Building2 size={14} className="shrink-0 opacity-90" aria-hidden />
                    <span className="truncate">{getClientAbbreviationLabel(clientInfo.name, clientInfo.slug)}</span>
                  </Badge>
                </Link>
              ) : search.client_id === null ? (
                <Badge variant="mono" className="text-xs sm:text-sm">
                  No client attached
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3 sm:pt-0.5">
            {search.completed_at && (
              <span className="hidden sm:flex items-center gap-1 text-xs text-text-muted">
                <Clock size={12} />
                {formatRelativeTime(search.completed_at)}
              </span>
            )}
            {/* Header CTA is the single filled primary on the page — the
                bottom "Turn these findings into a content plan" panel was
                retired, so this is now the page's one strong call to action. */}
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (!clientInfo) {
                  // No client attached yet — open the inline picker so the
                  // user can attach in-place and land in the lab without a
                  // round-trip through the admin settings.
                  setAttachDialogOpen(true);
                  return;
                }
                // Pre-pin this search as the ONLY selection so the Strategy
                // Lab workspace auto-attaches it on mount. See the multi-pin
                // hoisted state in content-lab-workspace.tsx.
                try {
                  const key = contentLabTopicSearchStorageKey(clientInfo.id);
                  window.localStorage.setItem(key, JSON.stringify([search.id]));
                } catch {
                  /* quota / JSON — non-fatal, user will see the lab but nothing pinned */
                }
                // Route param is the client UUID, not the slug.
                router.push(`/admin/strategy-lab/${clientInfo.id}`);
              }}
              title={clientInfo ? `Open this search in Strategy Lab with ${clientInfo.name}` : 'Pick a client and open in Strategy Lab'}
            >
              <FlaskConical size={14} aria-hidden />
              Open in Strategy Lab
            </Button>
            <ContentLabAttachClientDialog
              open={attachDialogOpen}
              onClose={() => setAttachDialogOpen(false)}
              searchId={search.id}
            />
            <ExportPdfButton search={search} clientName={clientInfo?.name} agency={agencyBrand} />
            <ShareButton searchId={search.id} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="w-full px-6 py-8 space-y-6 sm:space-y-8">
        {search.summary ? (
          <div className="rounded-xl border border-nativz-border bg-surface p-5 sm:p-6">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10 lg:items-start">
              <ExecutiveSummary summary={search.summary} />
              <BrandApplication
                content={aiResponse?.brand_alignment_notes}
                clientName={clientInfo?.name}
              />
            </div>
          </div>
        ) : null}

        {/* AI takeaways — content pillars + recommendations */}
        {(aiResponse || search.summary) ? (
          <div className="rounded-xl border border-nativz-border bg-surface p-5 sm:p-6">
            <AiTakeaways
              aiResponse={aiResponse}
              summary={search.summary}
              clientName={clientInfo?.name}
              hasAttachedClient={!!clientInfo}
            />
          </div>
        ) : null}

        {/* Scraped videos — outlier board, video grid, hook patterns */}
        <ScrapedVideosSection
          searchId={search.id}
          scrapedVideoCount={scrapedVideoCount}
          webContext={((search as { pipeline_state?: { web_context?: unknown } }).pipeline_state?.web_context ?? null) as never}
          defaultClientId={search.client_id}
          clientName={clientInfo?.name ?? null}
        />

        {aiResponse?.synthetic_audiences?.segments?.length ? (
          <TopicSyntheticAudiences data={aiResponse.synthetic_audiences} />
        ) : null}

        {search.activity_data && search.activity_data.length > 0 ? (
          <ActivityChart data={search.activity_data} />
        ) : null}

        {(Boolean(search.emotions?.length) || Boolean(search.content_breakdown)) ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {search.emotions && search.emotions.length > 0 ? (
              <EmotionsBreakdown emotions={search.emotions} />
            ) : null}
            {search.content_breakdown ? (
              <ContentBreakdown data={search.content_breakdown} />
            ) : null}
          </div>
        ) : null}

        {/* Render trending topics */}
        {trendingTopics.length > 0 ? (
          <TrendingTopicsTable topics={trendingTopics} clientId={clientInfo?.id ?? undefined} searchId={search.id} />
        ) : null}

        {Boolean(aiResponse) &&
        ((aiResponse!.content_pillars?.length ?? 0) > 0 || Boolean(aiResponse!.niche_performance_insights)) ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {(aiResponse!.content_pillars?.length ?? 0) > 0 && aiResponse!.content_pillars ? (
              <ContentPillars pillars={aiResponse!.content_pillars} />
            ) : null}
            {aiResponse!.niche_performance_insights ? (
              <NicheInsights insights={aiResponse!.niche_performance_insights} />
            ) : null}
          </div>
        ) : null}

      </div>

      <ScrollToTop />
    </div>
  );
}
