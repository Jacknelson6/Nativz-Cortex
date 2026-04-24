'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Globe,
  HelpCircle,
  Plus,
  Loader2,
  MessageCircle,
  Music,
  Youtube,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ClientOption } from '@/components/ui/client-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils/cn';
import { TIME_RANGE_OPTIONS } from '@/lib/types/search';
import type { SearchPlatform } from '@/lib/types/search';
import { PLATFORM_CONFIG } from '@/components/search/platform-icon';

interface ResearchTopicFormProps {
  clients: ClientOption[];
  initialQuery?: string;
  /** First name for greeting (inline hero) */
  userFirstName?: string | null;
  onStarted?: (item: {
    id: string;
    query: string;
    mode: string;
    clientName: string | null;
    needsSubtopics?: boolean;
  }) => void;
  /** Topic searches selected in the History rail to merge into Strategy lab for that client. */
  contentLabBulkSelection?: { ids: string[]; clientId: string | null };
  /** Called when the selected client changes (for filtering history rail) */
  onClientChange?: (clientId: string | null) => void;
  /** Preselect a brand on mount — used to rehydrate from localStorage so the
   *  selection survives navigation (opening a report and hitting back). */
  initialClientId?: string | null;
  /** Display name for the attached brand. Used by the "Suggest topics
   *  for X" CTA so the brand name shows even when the brand isn't in
   *  the page's `clients` roster (e.g. hide_from_roster is true). */
  initialClientName?: string | null;
  /** Portal mode: lock to a specific client, hide client picker, redirect to /portal */
  portalMode?: boolean;
  fixedClientId?: string | null;
  fixedClientName?: string | null;
}

/** First name for "Hello, …" — title-cases a single token (e.g. email local-part). */
function greetingDisplayName(raw: string | null | undefined): string {
  const t = raw?.trim();
  if (!t) return 'there';
  const first = t.split(/\s+/)[0] ?? t;
  if (!first) return 'there';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

// NOTE: looksLikeUrl / normalizeUrlInput / brandPillLabel / ContextMode
// helpers were retired alongside the URL-mode brand popover. Prospect
// URL audits now live in AuditHub (/admin/analyze-social); the only
// brand-attach surface on Trend Finder is the session-driven chip
// below (selectedClient).

export function ResearchTopicForm({
  clients,
  initialQuery = '',
  userFirstName,
  onStarted,
  contentLabBulkSelection,
  onClientChange,
  initialClientId = null,
  initialClientName = null,
  portalMode = false,
  fixedClientId = null,
  fixedClientName = null,
}: ResearchTopicFormProps) {
    const router = useRouter();
    const [topicQuery, setTopicQuery] = useState(initialQuery);
    // NAT-57 follow-up (2026-04-21): no local brand state anymore. In
    // admin mode the form always uses the session brand (propagated via
    // `initialClientId` from ResearchHub's `useActiveBrand()` hook); in
    // portal mode it uses the fixed brand bound to the viewer's account.
    // Keeping a separate local copy was the root cause of the drift bug
    // where the form showed a stale brand (Museum of Illusions) while
    // the top-bar pill already pointed somewhere else.
    const clientId = portalMode ? fixedClientId : initialClientId;
    const platforms = new Set<SearchPlatform>(['web', 'reddit', 'youtube', 'tiktok']);
    const [timeRange, setTimeRange] = useState('last_3_months');
    const [language] = useState('all');
    const [country] = useState('us');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showBestPractices, setShowBestPractices] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);

    useEffect(() => {
      if (initialQuery) setTopicQuery(initialQuery);
    }, [initialQuery]);

    const selectedClient = clients.find((c) => c.id === clientId);

    const step1Valid = topicQuery.trim().length > 0;

    async function handleRunResearch() {
      setError('');
      setLoading(true);
      try {
        const searchMode = clientId ? 'client_strategy' : 'general';
        const body = {
          query: topicQuery.trim(),
          source: 'all',
          time_range: timeRange,
          language,
          country,
          client_id: portalMode ? fixedClientId : clientId,
          search_mode: searchMode,
          // Always include web; per-platform counts are admin-controlled via
          // scraper_settings, so we no longer send a volume tier.
          platforms: Array.from(new Set([...platforms, 'web'])),
        };

        const res = await fetch('/api/search/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = (await res.json()) as { id?: string; error?: string; topic_pipeline?: string };
        if (!res.ok) {
          setError(data.error || 'Search failed');
          setLoading(false);
          return;
        }

        const needsSubtopics = data.topic_pipeline === 'llm_v1';
        const prefix = portalMode ? '/portal' : '/admin';

        onStarted?.({
          id: data.id!,
          query: topicQuery.trim(),
          mode: searchMode,
          clientName: portalMode ? fixedClientName : (selectedClient?.name ?? null),
          needsSubtopics,
        });
        const dest = needsSubtopics
          ? `${prefix}/search/${data.id}/subtopics`
          : `${prefix}/search/${data.id}/processing`;
        router.push(dest);
      } catch {
        setError('Something went wrong. Try again.');
      } finally {
        setLoading(false);
      }
    }

    function handlePrimaryClick() {
      if (!step1Valid) return;
      void handleRunResearch();
    }

    const greetingName = greetingDisplayName(userFirstName);
    const timeLabel = TIME_RANGE_OPTIONS.find((o) => o.value === timeRange)?.label ?? 'Last 3 months';
    const platformPopoverIcons: Record<
      'web' | 'reddit' | 'youtube' | 'tiktok',
      typeof Globe
    > = {
      web: Globe,
      reddit: MessageCircle,
      youtube: Youtube,
      tiktok: Music,
    };

    /** Web first (always on). */
    const platformPopoverRows: { value: keyof typeof platformPopoverIcons; label: string }[] = [
      { value: 'web', label: 'Web' },
      { value: 'reddit', label: 'Reddit' },
      { value: 'youtube', label: 'YouTube' },
      { value: 'tiktok', label: 'TikTok' },
    ];

    const pillBtn =
      'inline-flex shrink-0 h-9 max-w-[min(100%,11rem)] items-center gap-2 rounded-full border border-nativz-border bg-surface-hover/80 px-3 text-left text-xs font-medium text-text-secondary shadow-sm transition hover:border-accent/35 hover:bg-surface-hover';

    const bulkIds = contentLabBulkSelection?.ids ?? [];
    const bulkClientId = contentLabBulkSelection?.clientId ?? null;
    const bulkHasSelection = bulkIds.length > 0;
    const bulkReady = bulkHasSelection && bulkClientId != null;
    const contentLabHref = bulkReady
      ? `/admin/strategy-lab/${bulkClientId}`
      : '/admin/strategy-lab';

    return (
      <div className="w-full">
        <div className="text-center">
          <p className="text-sm font-medium text-text-muted">Hey, {greetingName}</p>
          <p className="mt-1.5 text-xl font-semibold tracking-tight text-text-primary md:text-2xl">
            Find out what&apos;s trending
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-text-muted md:text-sm">
            We scan the web, Reddit, YouTube, and TikTok for what&apos;s resonating right now.
          </p>
        </div>

          <div className="mx-auto mt-4 w-full max-w-xl overflow-hidden rounded-[1.75rem] border border-nativz-border bg-surface-hover/35 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_32px_-12px_rgba(0,0,0,0.45)] transition-colors focus-within:border-accent/35 focus-within:bg-surface-hover/50 focus-within:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(91,163,230,0.12),0_12px_40px_-16px_rgba(0,0,0,0.5)] md:mt-5">
            <label htmlFor="research-topic-query" className="sr-only">
              Research topic
            </label>
            <input
              id="research-topic-query"
              type="text"
              value={topicQuery}
              onChange={(e) => setTopicQuery(e.target.value)}
              placeholder="Search a topic or brand name"
              className="w-full min-h-[3.25rem] border-0 bg-transparent px-4 pt-4 pb-2 text-sm font-normal leading-relaxed text-foreground placeholder:text-text-muted/80 focus:outline-none md:min-h-[3.5rem] md:px-5 md:pt-5 md:text-base"
              autoComplete="off"
              autoFocus={Boolean(initialQuery)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !step1Valid) return;
                e.preventDefault();
                void handleRunResearch();
              }}
            />

          <div className="flex flex-nowrap items-center gap-2 border-t border-nativz-border/60 px-3 pb-3 pt-2">
            <div
              className="flex min-h-[2.5rem] min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto py-0.5 [scrollbar-width:thin] [-ms-overflow-style:auto] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-nativz-border/80"
              role="group"
              aria-label="Search filters"
            >
              {/* NAT-57 follow-up (2026-04-21): the attached-brand chip
               *  lived here as a visible reminder of which brand the
               *  search was scoped to. Jack removed it — the top-bar
               *  session pill is the single source of truth for brand
               *  context. Duplicating it inside every form creates drift
               *  bugs (two places of "truth") and clutters the UI.
               *
               *  History filtering still honors the session brand; see
               *  ResearchHub.tsx's allItems useMemo. */}

              {/* (Depth removed — always deep) */}

              {/* Time range */}
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className={pillBtn}>
                    <Clock size={15} className="shrink-0 text-text-muted" aria-hidden />
                    <span className="truncate">{timeLabel}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={8}
                  matchAnchorWidth={false}
                  className="w-52 border-nativz-border bg-surface p-1 shadow-[var(--shadow-dropdown)]"
                >
                  {TIME_RANGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTimeRange(opt.value)}
                      className={cn(
                        'flex w-full rounded-lg px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-hover',
                        timeRange === opt.value && 'bg-accent-surface font-medium text-accent-text'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              {/* Platforms — Web / Reddit / YouTube / TikTok. Each icon    */}
              {/* tints to its Trend-finder breakdown colour so the pill     */}
              {/* reads as a legend the user sees everywhere else.           */}
              <div className={pillBtn}>
                {(['web', 'reddit', 'youtube', 'tiktok'] as const).map((p) => {
                  const cfg = PLATFORM_CONFIG[p];
                  if (!cfg) return null;
                  const Icon = cfg.icon;
                  return (
                    <span key={p} title={cfg.label} className={cfg.color}>
                      <Icon size={15} />
                    </span>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={handlePrimaryClick}
              disabled={!step1Valid || loading}
              aria-label="Run research"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent text-white shadow-[0_0_24px_-6px_rgba(91,163,230,0.55)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" aria-hidden />
              ) : (
                <ArrowRight size={18} strokeWidth={2.25} aria-hidden />
              )}
            </button>
          </div>
          </div>

        {/* Suggest topics — visible when a client is selected */}
        {clientId && (
          <div className="mx-auto mt-3 w-full max-w-xl">
            {suggestions.length === 0 ? (
              <button
                type="button"
                onClick={async () => {
                  // NAT-57 follow-up (2026-04-21): this button was
                  // silently swallowing errors — any 4xx/5xx from
                  // /api/search/suggest-topics would leave it stuck in
                  // idle with no feedback. Jack rightly flagged it as
                  // "not working." Now we surface failures via toast +
                  // log the body so we can diagnose from DevTools.
                  if (!clientId) {
                    toast.error('No brand attached. Pick one in the top-bar pill.');
                    return;
                  }
                  setLoadingSuggestions(true);
                  setSuggestions([]);
                  try {
                    const res = await fetch('/api/search/suggest-topics', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ client_id: clientId }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      const msg = typeof data.error === 'string'
                        ? data.error
                        : `Couldn't generate suggestions (HTTP ${res.status})`;
                      console.error('suggest-topics failed', res.status, data);
                      toast.error(msg);
                      return;
                    }
                    const list: string[] = Array.isArray(data.suggestions)
                      ? data.suggestions.filter((s: unknown) => typeof s === 'string')
                      : [];
                    if (list.length === 0) {
                      toast.info(
                        'No suggestions came back — add more brand data (description, industry, keywords) and try again.',
                      );
                      return;
                    }
                    setSuggestions(list);
                  } catch (err) {
                    console.error('suggest-topics network error', err);
                    toast.error('Network error generating suggestions');
                  } finally {
                    setLoadingSuggestions(false);
                  }
                }}
                disabled={loadingSuggestions}
                className="mx-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-text-muted transition hover:bg-surface-hover hover:text-text-secondary"
              >
                {loadingSuggestions ? (
                  <><Loader2 size={13} className="animate-spin" aria-hidden /> Generating ideas...</>
                ) : (
                  <><Plus size={13} aria-hidden /> Suggest topics for {selectedClient?.name ?? fixedClientName ?? initialClientName ?? 'this client'}</>
                )}
              </button>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => {
                      setTopicQuery(topic);
                      setSuggestions([]);
                    }}
                    className="rounded-full border border-nativz-border bg-surface-hover/80 px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-accent/35 hover:text-accent-text cursor-pointer"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {portalMode && (
          <div className="mx-auto mt-3 w-full max-w-xl">
            <button
              type="button"
              onClick={() => setShowBestPractices((v) => !v)}
              className="mx-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-text-muted transition hover:bg-surface-hover hover:text-text-secondary"
            >
              <HelpCircle size={14} aria-hidden />
              <span>Search best practices</span>
              <ChevronDown
                size={13}
                className={cn(
                  'transition-transform duration-200',
                  showBestPractices && 'rotate-180',
                )}
                aria-hidden
              />
            </button>

            {showBestPractices && (
              <div className="mt-2 rounded-2xl border border-nativz-border bg-surface/60 px-5 py-4 text-sm leading-relaxed text-text-secondary backdrop-blur-sm">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  How to get great results
                </p>

                <ol className="list-none space-y-3 pl-0">
                  <li className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent-text">1</span>
                    <div>
                      <p className="font-medium text-text-primary">Define your objective first</p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        Before you type anything, know what you&apos;re looking for. Are you gathering brand sentiment? Finding content gaps? Looking for new video ideas? Developing a strategy? Your goal shapes your search.
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent-text">2</span>
                    <div>
                      <p className="font-medium text-text-primary">Search a specific topic</p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        Once you know your goal, search for the specific topic you want content around. For example, &quot;avocado toast&quot; or &quot;avocado toast recipes.&quot; The more specific you are, the more targeted your results.
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent-text">3</span>
                    <div>
                      <p className="font-medium text-text-primary">Adjust the date range</p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        Don&apos;t forget you can change the time range filter to surface what&apos;s trending right now vs. what&apos;s performed well over time.
                      </p>
                    </div>
                  </li>
                </ol>

                <div className="mt-4 border-t border-nativz-border/60 pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Common mistakes to avoid
                  </p>
                  <ul className="space-y-1.5 pl-0 text-xs text-text-muted">
                    <li className="flex items-start gap-2">
                      <span className="mt-1 block h-1 w-1 shrink-0 rounded-full bg-red-400/70" />
                      <span><strong className="text-text-secondary">Too vague.</strong> Single-word or generic searches give broad results. Be specific about the topic you want content around.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 block h-1 w-1 shrink-0 rounded-full bg-red-400/70" />
                      <span><strong className="text-text-secondary">Too narrow.</strong> Extremely niche topics may not have much existing content. Cortex will still build a strategy, but results work best with topics that have an active content landscape.</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 text-center text-sm text-red-400">{error}</p>
        )}

      </div>
    );
}
