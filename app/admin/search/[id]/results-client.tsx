'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { ExecutiveSummary } from '@/components/reports/executive-summary';
import { MetricsRow } from '@/components/results/metrics-row';
import { EmotionsBreakdown } from '@/components/results/emotions-breakdown';
import { ContentBreakdown } from '@/components/results/content-breakdown';
import { TrendingTopicsTable } from '@/components/results/trending-topics-table';
import { ContentPillars } from '@/components/results/content-pillars';
import { NicheInsights } from '@/components/results/niche-insights';
import { SourcesPanel } from '@/components/results/sources-panel';
import { SourceBrowser } from '@/components/results/source-browser';
import { ActivityChart } from '@/components/charts/activity-chart';
import { KeyFindings } from '@/components/results/key-findings';
import { BigMovers } from '@/components/results/big-movers';
import { CompetitiveAnalysis } from '@/components/results/competitive-analysis';
import { ExportPdfButton } from '@/components/results/export-pdf-button';
import { ShareButton } from '@/components/results/share-button';
import { SearchProgress } from '@/components/search/search-progress';
import { SearchIdeasWizard } from '@/components/research/search-ideas-wizard';
import type { ClientOption } from '@/components/ui/client-picker';
import { hasSerp, isNewMetrics } from '@/lib/types/search';
import type { TopicSearch, TopicSearchAIResponse, TrendingTopic, LegacyTrendingTopic, PlatformSource } from '@/lib/types/search';
import { RelatedTopics } from '@/components/search/related-topics';
import { IdeationPipelinePanel } from '@/components/ideation/ideation-pipeline-panel';
import { TopicSyntheticAudiences } from '@/components/results/topic-synthetic-audiences';
import { getClientAbbreviationLabel } from '@/lib/clients/client-abbreviations';

interface LinkedIdea {
  id: string;
  concept: string | null;
  count: number;
  createdAt: string;
}

interface LinkedBoardRow {
  id: string;
  name: string;
}

interface AdminResultsClientProps {
  search: TopicSearch;
  clientInfo?: { id: string; name: string; slug: string; industry?: string } | null;
  clients: ClientOption[];
  linkedIdeas?: LinkedIdea[];
  linkedBoards?: LinkedBoardRow[];
  videoCandidateCount?: number;
}

export function AdminResultsClient({
  search,
  clientInfo,
  clients,
  linkedIdeas = [],
  linkedBoards = [],
  videoCandidateCount = 0,
}: AdminResultsClientProps) {
  const router = useRouter();
  const [showIdeasWizard, setShowIdeasWizard] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(search.query);
  const [savingTitle, setSavingTitle] = useState(false);
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
        <Link href="/admin/search/new">
          <Button variant="outline">New search</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="border-b border-nativz-border bg-surface">
        <div className="flex flex-col gap-3 px-6 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Link
              href="/admin/search/new?history=true"
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
                    className="block w-full min-w-0 flex-1 rounded-lg border border-nativz-border bg-background px-3 py-2 text-base font-semibold leading-snug text-text-primary shadow-[var(--shadow-card)] focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-lg"
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
                    className="w-full rounded-md px-1 py-0.5 text-left text-base font-semibold leading-snug text-text-primary break-words [overflow-wrap:anywhere] transition-colors hover:bg-surface-hover/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:text-lg"
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
                  <Badge variant="info" className="gap-1.5 px-2.5 py-1 text-xs font-medium">
                    <Building2 size={12} className="shrink-0 opacity-90" aria-hidden />
                    <span className="truncate">{getClientAbbreviationLabel(clientInfo.name, clientInfo.slug)}</span>
                  </Badge>
                </Link>
              ) : search.client_id === null ? (
                <Badge variant="mono" className="text-[11px]">
                  No client attached
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3 sm:pt-0.5">
            <ExportPdfButton search={search} clientName={clientInfo?.name} />
            <ShareButton searchId={search.id} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {(search.summary || aiResponse?.brand_alignment_notes) ? (
          <div className="rounded-xl border border-nativz-border bg-surface p-4 sm:p-5 space-y-5">
            {search.summary ? <ExecutiveSummary summary={search.summary} /> : null}
            {aiResponse?.brand_alignment_notes ? (
              <ExecutiveSummary summary={aiResponse.brand_alignment_notes} variant="brand" />
            ) : null}
          </div>
        ) : null}

        <IdeationPipelinePanel
          searchId={search.id}
          query={search.query}
          videoCandidateCount={videoCandidateCount}
          linkedBoards={linkedBoards}
          linkedIdeas={linkedIdeas.map((g) => ({
            id: g.id,
            count: g.count,
            concept: g.concept,
          }))}
          onOpenIdeasWizard={() => setShowIdeasWizard(true)}
        />

        {/* Linked ideas banner */}
        {linkedIdeas.length > 0 ? (
          <div className="rounded-xl border border-accent2/20 bg-accent2/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent2-surface shrink-0">
                <Sparkles size={16} className="text-accent2-text" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">
                  {linkedIdeas.length === 1 ? 'Video ideas generated from this research' : `${linkedIdeas.length} idea sets generated from this research`}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {linkedIdeas.map((g) => `${g.count} ideas${g.concept ? ` — "${g.concept}"` : ''}`).join(' · ')}
                </p>
              </div>
              <Link
                href={`/admin/ideas/${linkedIdeas[0].id}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent2-surface px-3 py-1.5 text-xs font-medium text-accent2-text hover:bg-accent2-surface transition-colors shrink-0"
              >
                <Sparkles size={12} />
                View ideas
              </Link>
            </div>
          </div>
        ) : null}

        {/* Key Findings Cards */}
        {Boolean(search.summary && aiResponse?.trending_topics) ? (
          <KeyFindings
            summary={search.summary!}
            topics={aiResponse!.trending_topics}
            overallSentiment={
              aiResponse!.overall_sentiment ??
              (search.metrics && isNewMetrics(search.metrics) ? search.metrics.overall_sentiment : undefined)
            }
          />
        ) : null}

        {search.metrics ? (
          <MetricsRow
            metrics={search.metrics}
            isBrandSearch={!!aiResponse?.brand_alignment_notes}
            platformBreakdown={aiResponse?.platform_breakdown}
          />
        ) : null}

        {aiResponse?.synthetic_audiences?.segments?.length ? (
          <TopicSyntheticAudiences data={aiResponse.synthetic_audiences} />
        ) : null}

        {search.activity_data && search.activity_data.length > 0 ? (
          <ActivityChart data={search.activity_data} />
        ) : null}

        {(Boolean(search.emotions?.length) || Boolean(search.content_breakdown)) ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {search.emotions && search.emotions.length > 0 ? (
              <EmotionsBreakdown emotions={search.emotions} searchId={search.id} />
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

        {/* Competitive Analysis (brand search) */}
        {Boolean(aiResponse?.niche_performance_insights && aiResponse?.brand_alignment_notes) ? (
          <CompetitiveAnalysis nicheInsights={aiResponse!.niche_performance_insights!} />
        ) : null}

        {/* Big movers — who's making noise in this space */}
        {Boolean(aiResponse?.big_movers?.length) ? (
          <BigMovers movers={aiResponse!.big_movers!} />
        ) : null}

        {/* Source browser — browse posts by platform */}
        {Boolean(
          search.platform_data && (search.platform_data as Record<string, unknown>).sources,
        ) ? (
          <SourceBrowser sources={(search.platform_data as Record<string, unknown>).sources as PlatformSource[]} />
        ) : null}

        {hasSerp(search) && search.serp_data ? (
          <SourcesPanel serpData={search.serp_data} />
        ) : null}

        {/* Explore related topics */}
        <RelatedTopics searchId={search.id} />
      </div>

      <ScrollToTop />

      {/* Ideas wizard modal */}
      <SearchIdeasWizard
        open={showIdeasWizard}
        onClose={() => setShowIdeasWizard(false)}
        searchId={search.id}
        clientId={search.client_id ?? null}
        clients={clients}
      />
    </div>
  );
}
