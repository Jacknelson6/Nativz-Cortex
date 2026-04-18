'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BarChart3,
  Building2,
  ChevronDown,
  Clock,
  Compass,
  Globe,
  HelpCircle,
  Loader2,
  MessageCircle,
  Music,
  Search,
  X,
  Youtube,
} from 'lucide-react';
import { ClientLogo } from '@/components/clients/client-logo';
import { ClientPickerModal, type ClientOption } from '@/components/ui/client-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';
import { mergeTopicSearchSelectionIntoLocalStorage } from '@/lib/content-lab/topic-search-selection-storage';
import { TIME_RANGE_OPTIONS } from '@/lib/types/search';
import type { SearchPlatform, SearchVolume } from '@/lib/types/search';
import { PLATFORM_CONFIG } from '@/components/search/platform-icon';

export type ContextMode = 'none' | 'client' | 'url';

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

function looksLikeUrl(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^www\./i.test(t)) return true;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)+\.[a-z]{2,}(\/[^\s]*)?$/i.test(t);
}

function normalizeUrlInput(s: string): string {
  const t = s.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function brandPillLabel(
  contextMode: ContextMode,
  selectedClient: ClientOption | undefined,
  url: string
): string {
  if (contextMode === 'client' && selectedClient) return selectedClient.name;
  if (contextMode === 'url' && url) {
    try {
      return new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    } catch {
      return 'URL';
    }
  }
  return 'Brand';
}

export function ResearchTopicForm({
  clients,
  initialQuery = '',
  userFirstName,
  onStarted,
  contentLabBulkSelection,
  onClientChange,
  initialClientId = null,
  portalMode = false,
  fixedClientId = null,
  fixedClientName = null,
}: ResearchTopicFormProps) {
    const router = useRouter();
    const [topicQuery, setTopicQuery] = useState(initialQuery);
    // Restore the brand selection from the parent's localStorage-backed value
    // so navigating away and back doesn't reset the user's brand pick.
    const hydratedClient = portalMode
      ? null
      : (initialClientId ? clients.find((c) => c.id === initialClientId) ?? null : null);
    const [contextMode, setContextMode] = useState<ContextMode>(
      portalMode && fixedClientId ? 'client' : hydratedClient ? 'client' : 'none',
    );
    const [clientId, setClientId] = useState<string | null>(
      portalMode ? fixedClientId : (hydratedClient?.id ?? null),
    );
    const [url, setUrl] = useState('');
    const [contextSearch, setContextSearch] = useState(hydratedClient?.name ?? '');
    const [clientPickerOpen, setClientPickerOpen] = useState(false);
    const [brandPopoverOpen, setBrandPopoverOpen] = useState(false);
    const [clientPickerPortal, setClientPickerPortal] = useState<HTMLElement | null>(null);
    const platforms = new Set<SearchPlatform>(['web', 'reddit', 'youtube', 'tiktok']);
    const volume: SearchVolume = 'deep';
    const [timeRange, setTimeRange] = useState('last_3_months');
    const [language] = useState('all');
    const [country] = useState('us');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showBestPractices, setShowBestPractices] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);

    useEffect(() => {
      setClientPickerPortal(document.body);
    }, []);

    useEffect(() => {
      if (initialQuery) setTopicQuery(initialQuery);
    }, [initialQuery]);

    // Parent (ResearchHub) reads the persisted brand from localStorage in a
    // useEffect, so `initialClientId` can arrive AFTER this form's first render.
    // Without this sync the rail would filter to that brand while the pill
    // still showed "Brand", making it look like a brand is selected when it
    // isn't. Only hydrate when we don't already have a user-picked client —
    // never override an active clear or a new pick.
    useEffect(() => {
      if (portalMode) return;
      if (!initialClientId) return;
      if (clientId) return;
      const c = clients.find((x) => x.id === initialClientId);
      if (!c) return;
      setClientId(c.id);
      setContextMode('client');
      setContextSearch(c.name);
    }, [initialClientId, portalMode, clients, clientId]);

    const selectedClient = clients.find((c) => c.id === clientId);

    const clientsForDropdown = useMemo(() => {
      if (looksLikeUrl(contextSearch)) return [];
      const q = contextSearch.trim().toLowerCase();
      const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name));
      if (!q) return sorted;
      return sorted.filter((c) => c.name.toLowerCase().includes(q));
    }, [contextSearch, clients]);

    function handleContextSearchChange(v: string) {
      setContextSearch(v);
      const t = v.trim();
      if (!t) {
        setContextMode('none');
        setClientId(null);
        setUrl('');
        return;
      }
      if (looksLikeUrl(v)) {
        setContextMode('url');
        setUrl(normalizeUrlInput(v));
        setClientId(null);
        return;
      }
      setUrl('');
      if (clientId) {
        const sel = clients.find((c) => c.id === clientId);
        if (sel && v === sel.name) {
          setContextMode('client');
          return;
        }
        setClientId(null);
        setContextMode('none');
      }
    }

    function pickClient(id: string) {
      const c = clients.find((x) => x.id === id);
      if (!c) return;
      setClientId(id);
      setContextSearch(c.name);
      setContextMode('client');
      setUrl('');
      setBrandPopoverOpen(false);
      onClientChange?.(id);
    }

    function clearBrand() {
      setContextMode('none');
      setClientId(null);
      setUrl('');
      setContextSearch('');
      onClientChange?.(null);
    }

    const step1Valid =
      topicQuery.trim().length > 0 &&
      (contextMode === 'none' ||
        (contextMode === 'client' && !!clientId) ||
        (contextMode === 'url' && url.trim().length > 0));

    async function handleRunResearch() {
      setError('');
      setLoading(true);
      try {
        const searchMode = contextMode === 'client' ? 'client_strategy' : 'general';
        const body = {
          query: topicQuery.trim(),
          source: 'all',
          time_range: timeRange,
          language,
          country,
          client_id: portalMode ? fixedClientId : (contextMode === 'client' ? clientId : null),
          search_mode: searchMode,
          platforms: Array.from(new Set([...platforms, 'web'])).filter((p) => p !== 'quora'),
          volume,
          ...(contextMode === 'url' && url.trim() ? { brand_url: url.trim() } : {}),
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

    /** Web first (always on); Quora not offered in UI. */
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
          <div className="mt-1.5 flex items-center justify-center gap-2">
            <p className="text-xl font-semibold tracking-tight text-text-primary md:text-2xl">
              What&apos;s trending?
            </p>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="About Trend Finder"
                  className="rounded-full p-1 text-text-muted transition hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
                >
                  <HelpCircle size={15} aria-hidden />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="center"
                sideOffset={6}
                matchAnchorWidth={false}
                className="w-[min(22rem,calc(100vw-2rem))] border-nativz-border bg-surface p-4 text-sm leading-relaxed text-text-secondary shadow-[var(--shadow-dropdown)]"
              >
                <p className="mb-1.5 text-sm font-semibold text-text-primary">Trend Finder</p>
                <p className="text-xs text-text-muted">
                  Search any topic or brand and Cortex scans the web, Reddit, YouTube, and TikTok to surface what&apos;s resonating right now — so your shoots are built around topics people already care about.
                </p>
                <p className="mt-2 text-xs text-text-muted">
                  Attach a brand to frame results around that client&apos;s audience, or leave it open for general discovery.
                </p>
              </PopoverContent>
            </Popover>
          </div>
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
              {/* Brand — popover lists clients as logos; hidden in portal mode (client is fixed) */}
              {portalMode ? null : <Popover open={brandPopoverOpen} onOpenChange={setBrandPopoverOpen}>
                <div
                  className={cn(
                    'inline-flex h-9 max-w-[min(100%,13rem)] min-w-0 shrink-0 items-stretch rounded-full border border-nativz-border bg-surface-hover/80 text-xs font-medium text-text-secondary shadow-sm transition hover:border-accent/35 hover:bg-surface-hover',
                    (contextMode === 'client' || contextMode === 'url') && 'pr-0.5'
                  )}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-text-secondary hover:bg-transparent"
                    >
                      {contextMode === 'client' && selectedClient ? (
                        <ClientLogo
                          src={selectedClient.logo_url}
                          name={selectedClient.name}
                          size="sm"
                          className="h-7 w-7 shrink-0 !rounded-md"
                        />
                      ) : (
                        <Building2 size={15} className="shrink-0 text-text-muted" aria-hidden />
                      )}
                      <span className="truncate">{brandPillLabel(contextMode, selectedClient, url)}</span>
                    </button>
                  </PopoverTrigger>
                  {(contextMode === 'client' || contextMode === 'url') && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        clearBrand();
                      }}
                      className="flex shrink-0 items-center justify-center rounded-full p-1.5 text-text-muted transition hover:bg-background/40 hover:text-text-primary"
                      aria-label="Remove brand"
                    >
                      <X size={15} strokeWidth={2} aria-hidden />
                    </button>
                  )}
                </div>
                <PopoverContent
                  align="start"
                  sideOffset={8}
                  matchAnchorWidth={false}
                  className="w-[min(22rem,calc(100vw-2rem))] border-nativz-border bg-surface p-0 text-text-primary shadow-[var(--shadow-dropdown)]"
                >
                  <div className="border-b border-nativz-border p-3">
                    <div className="relative">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        type="text"
                        value={contextSearch}
                        onChange={(e) => handleContextSearchChange(e.target.value)}
                        placeholder="Search clients or paste a website URL…"
                        className="w-full rounded-lg border border-nativz-border bg-background py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-text-muted focus:border-accent focus:outline-none"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <div
                    className="max-h-56 overflow-y-auto p-2"
                    role="listbox"
                    aria-label="Clients"
                  >
                    {clientsForDropdown.length === 0 ? (
                      <p className="px-2 py-6 text-center text-sm text-text-muted">No matching clients</p>
                    ) : (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-2">
                        {clientsForDropdown.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            role="option"
                            aria-selected={clientId === c.id}
                            onClick={() => pickClient(c.id)}
                            className={cn(
                              'flex flex-col items-center gap-1.5 rounded-xl border border-transparent p-2 text-center transition-colors hover:bg-surface-hover',
                              clientId === c.id && 'border-accent/35 bg-accent/10',
                            )}
                          >
                            <ClientLogo
                              src={c.logo_url}
                              name={c.name}
                              size="sm"
                              className="shrink-0 rounded-lg"
                            />
                            <span className="line-clamp-2 w-full text-[10px] font-medium leading-tight text-text-primary">
                              {c.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 border-t border-nativz-border p-3">
                    <button
                      type="button"
                      onClick={() => {
                        setClientPickerOpen(true);
                        setBrandPopoverOpen(false);
                      }}
                      className="text-left text-xs font-medium text-accent-text hover:underline"
                    >
                      Browse all clients
                    </button>
                    {(contextMode === 'client' || contextMode === 'url') && (
                      <button
                        type="button"
                        onClick={() => {
                          clearBrand();
                          setBrandPopoverOpen(false);
                        }}
                        className="text-left text-xs text-text-muted hover:text-text-secondary"
                      >
                        Clear brand
                      </button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>}

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

              {/* Platforms — Web always on (toggle disabled); Reddit / YouTube / TikTok optional */}
              {/* Static platform badges — all always on, muted to match other pills */}
              <div className={pillBtn}>
                {(['web', 'reddit', 'youtube', 'tiktok'] as const).map((p) => {
                  const cfg = PLATFORM_CONFIG[p];
                  if (!cfg) return null;
                  const Icon = cfg.icon;
                  return (
                    <span key={p} title={cfg.label} className="text-text-muted">
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
        {contextMode === 'client' && clientId && (
          <div className="mx-auto mt-3 w-full max-w-xl">
            {suggestions.length === 0 ? (
              <button
                type="button"
                onClick={async () => {
                  setLoadingSuggestions(true);
                  setSuggestions([]);
                  try {
                    const res = await fetch('/api/search/suggest-topics', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ client_id: clientId }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setSuggestions(data.suggestions ?? []);
                    }
                  } catch { /* ignore */ }
                  finally { setLoadingSuggestions(false); }
                }}
                disabled={loadingSuggestions}
                className="mx-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-text-muted transition hover:bg-surface-hover hover:text-text-secondary"
              >
                {loadingSuggestions ? (
                  <><Loader2 size={13} className="animate-spin" aria-hidden /> Generating ideas...</>
                ) : (
                  <><Compass size={13} aria-hidden /> Suggest topics for {selectedClient?.name ?? 'this client'}</>
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

        {contextMode === 'url' && url && (
          <p className="mt-4 text-center text-xs text-text-muted">
            URL will be scraped for brand context (not saved to the knowledge base)
          </p>
        )}

        {error && (
          <p className="mt-4 text-center text-sm text-red-400">{error}</p>
        )}

        {clientPickerPortal &&
          clientPickerOpen &&
          createPortal(
            <div className="fixed inset-0 z-[100]">
              <ClientPickerModal
                clients={clients}
                value={clientId}
                onSelect={(id) => {
                  pickClient(id);
                  setClientPickerOpen(false);
                }}
                onClose={() => setClientPickerOpen(false)}
              />
            </div>,
            clientPickerPortal,
          )}
      </div>
    );
}
