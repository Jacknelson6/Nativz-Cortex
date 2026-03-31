'use client';

import { useState, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Building2,
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
import { ClientPickerModal, type ClientOption } from '@/components/ui/client-picker';
import { ClientLogo } from '@/components/clients/client-logo';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils/cn';
import { TIME_RANGE_OPTIONS, LANGUAGE_OPTIONS, PLATFORM_OPTIONS } from '@/lib/types/search';
import type { SearchPlatform, SearchVolume } from '@/lib/types/search';

export type ContextMode = 'none' | 'client' | 'url';

export type ResearchTopicSnapshot = {
  topicQuery: string;
  contextMode: ContextMode;
  clientId: string | null;
  url: string;
  contextSearch: string;
  timeRange: string;
  language: string;
  country: string;
};

export type ResearchTopicFormHandle = {
  getSnapshot: () => ResearchTopicSnapshot;
};

interface ResearchTopicFormProps {
  clients: ClientOption[];
  initialQuery?: string;
  topicPipelineLlmV1: boolean;
  /** Reserved; hub uses inline layout only */
  variant?: 'inline' | 'modal';
  /** First name for greeting (inline hero) */
  userFirstName?: string | null;
  onStarted?: (item: {
    id: string;
    query: string;
    mode: string;
    clientName: string | null;
    needsSubtopics?: boolean;
  }) => void;
  onLegacyContinue?: (snapshot: ResearchTopicSnapshot) => void;
}

function ClientAgencySublabel({ agency }: { agency: string | null | undefined }) {
  const a = agency?.trim();
  if (!a) return null;
  const lower = a.toLowerCase();
  const isAc = lower.includes('anderson') || lower === 'ac';
  return (
    <p
      className={`text-[9px] font-bold uppercase tracking-wider ${
        isAc ? 'text-emerald-400' : 'text-blue-400'
      }`}
    >
      {isAc ? 'Anderson Collaborative' : 'Nativz'}
    </p>
  );
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

export const ResearchTopicForm = forwardRef<ResearchTopicFormHandle, ResearchTopicFormProps>(
  function ResearchTopicForm(
    {
      clients,
      initialQuery = '',
      topicPipelineLlmV1,
      userFirstName,
      onStarted,
      onLegacyContinue,
    },
    ref
  ) {
    const router = useRouter();
    const [topicQuery, setTopicQuery] = useState(initialQuery);
    const [contextMode, setContextMode] = useState<ContextMode>('none');
    const [clientId, setClientId] = useState<string | null>(null);
    const [url, setUrl] = useState('');
    const [contextSearch, setContextSearch] = useState('');
    const [clientPickerOpen, setClientPickerOpen] = useState(false);
    const [brandPopoverOpen, setBrandPopoverOpen] = useState(false);
    const [clientPickerPortal, setClientPickerPortal] = useState<HTMLElement | null>(null);
    const [platforms, setPlatforms] = useState<Set<SearchPlatform>>(
      () => new Set(['web', 'reddit', 'youtube', 'tiktok', 'quora'])
    );
    const [volume] = useState<SearchVolume>('medium');
    const [timeRange, setTimeRange] = useState('last_3_months');
    const [language, setLanguage] = useState('all');
    const [country] = useState('us');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
      setClientPickerPortal(document.body);
    }, []);

    useEffect(() => {
      if (initialQuery) setTopicQuery(initialQuery);
    }, [initialQuery]);

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
    }

    function clearBrand() {
      setContextMode('none');
      setClientId(null);
      setUrl('');
      setContextSearch('');
    }

    const step1Valid =
      topicQuery.trim().length > 0 &&
      (contextMode === 'none' ||
        (contextMode === 'client' && !!clientId) ||
        (contextMode === 'url' && url.trim().length > 0));

    function buildSnapshot(): ResearchTopicSnapshot {
      return {
        topicQuery,
        contextMode,
        clientId,
        url,
        contextSearch,
        timeRange,
        language,
        country,
      };
    }

    useImperativeHandle(ref, () => ({
      getSnapshot: buildSnapshot,
    }));

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
          client_id: contextMode === 'client' ? clientId : null,
          search_mode: searchMode,
          platforms: Array.from(platforms),
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

        const needsSubtopics = topicPipelineLlmV1 || data.topic_pipeline === 'llm_v1';

        onStarted?.({
          id: data.id!,
          query: topicQuery.trim(),
          mode: searchMode,
          clientName: selectedClient?.name ?? null,
          needsSubtopics,
        });
        const dest = needsSubtopics
          ? `/admin/search/${data.id}/subtopics`
          : `/admin/search/${data.id}/processing`;
        router.push(dest);
      } catch {
        setError('Something went wrong. Try again.');
      } finally {
        setLoading(false);
      }
    }

    function handlePrimaryClick() {
      if (!step1Valid) return;
      if (topicPipelineLlmV1) {
        void handleRunResearch();
      } else {
        onLegacyContinue?.(buildSnapshot());
      }
    }

    const singleStep = topicPipelineLlmV1;
    const greetingName = greetingDisplayName(userFirstName);
    const timeLabel = TIME_RANGE_OPTIONS.find((o) => o.value === timeRange)?.label ?? 'Last 3 months';
    const languageLabel = LANGUAGE_OPTIONS.find((o) => o.value === language)?.label ?? 'All languages';

    const platformIcons: Record<SearchPlatform, typeof Globe> = {
      web: Globe,
      reddit: MessageCircle,
      youtube: Youtube,
      tiktok: Music,
      quora: HelpCircle,
    };

    function togglePlatform(p: SearchPlatform) {
      if (p === 'web') return; // web is always on
      setPlatforms((prev) => {
        const next = new Set(prev);
        if (next.has(p)) next.delete(p);
        else next.add(p);
        return next;
      });
    }

    const pillBtn =
      'inline-flex min-h-[2.25rem] max-w-[min(100%,11rem)] items-center gap-2 rounded-full border border-nativz-border bg-surface-hover/80 px-3 py-1.5 text-left text-xs font-medium text-text-secondary shadow-sm transition hover:border-accent/35 hover:bg-surface-hover';

    return (
      <div className="w-full">
        <div className="text-center">
          <p className="text-sm font-medium text-text-muted">Hello, {greetingName}</p>
          <p className="mt-1.5 text-xl font-semibold tracking-tight text-text-primary md:text-2xl">
            Discover trending topics
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
              className="w-full min-h-[3.25rem] border-0 bg-transparent px-4 pt-4 pb-2 text-[15px] font-normal leading-relaxed text-foreground placeholder:text-text-muted/80 focus:outline-none md:min-h-[3.5rem] md:px-5 md:pt-5 md:text-base"
              autoComplete="off"
              autoFocus={Boolean(initialQuery)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !step1Valid) return;
                e.preventDefault();
                handlePrimaryClick();
              }}
            />

          <div className="flex flex-col gap-3 border-t border-nativz-border/60 px-3 pb-3 pt-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {/* Brand */}
              <Popover open={brandPopoverOpen} onOpenChange={setBrandPopoverOpen}>
                <div
                  className={cn(
                    'inline-flex min-h-[2.25rem] max-w-[min(100%,13rem)] min-w-0 items-stretch rounded-full border border-nativz-border bg-surface-hover/80 text-xs font-medium text-text-secondary shadow-sm transition hover:border-accent/35 hover:bg-surface-hover',
                    (contextMode === 'client' || contextMode === 'url') && 'pr-0.5'
                  )}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-text-secondary hover:bg-transparent"
                    >
                      <Building2 size={15} className="shrink-0 text-text-muted" aria-hidden />
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
                    className="max-h-48 overflow-y-auto"
                    role="listbox"
                    aria-label="Clients"
                  >
                    {clientsForDropdown.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={clientId === c.id}
                        onClick={() => pickClient(c.id)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover"
                      >
                        <ClientLogo src={c.logo_url} name={c.name} size="sm" className="shrink-0 rounded-md" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text-primary">{c.name}</p>
                          <ClientAgencySublabel agency={c.agency} />
                        </div>
                      </button>
                    ))}
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
              </Popover>

              {/* Time */}
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

              {/* Language */}
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className={pillBtn}>
                    <Globe size={15} className="shrink-0 text-text-muted" aria-hidden />
                    <span className="truncate">{languageLabel}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={8}
                  matchAnchorWidth={false}
                  className="w-52 border-nativz-border bg-surface p-1 shadow-[var(--shadow-dropdown)]"
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setLanguage(opt.value)}
                      className={cn(
                        'flex w-full rounded-lg px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-hover',
                        language === opt.value && 'bg-accent-surface font-medium text-accent-text'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              {/* Platforms */}
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className={pillBtn}>
                    <Search size={15} className="shrink-0 text-text-muted" aria-hidden />
                    <span className="truncate">Platforms ({platforms.size})</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={8}
                  matchAnchorWidth={false}
                  className="w-56 border-nativz-border bg-surface p-1 shadow-[var(--shadow-dropdown)]"
                >
                  {PLATFORM_OPTIONS.map((opt) => {
                    const Icon = platformIcons[opt.value];
                    const active = platforms.has(opt.value);
                    const isWeb = opt.value === 'web';
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => togglePlatform(opt.value)}
                        disabled={isWeb}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-hover',
                          isWeb && 'cursor-default opacity-70'
                        )}
                      >
                        <Icon size={15} className="shrink-0 text-text-muted" aria-hidden />
                        <span className="flex-1">{opt.label}</span>
                        <span
                          className={cn(
                            'flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors',
                            active ? 'bg-accent' : 'bg-surface-hover border border-nativz-border'
                          )}
                        >
                          <span
                            className={cn(
                              'h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
                              active ? 'translate-x-3' : 'translate-x-0'
                            )}
                          />
                        </span>
                      </button>
                    );
                  })}
                </PopoverContent>
              </Popover>
            </div>

            <button
              type="button"
              onClick={handlePrimaryClick}
              disabled={!step1Valid || loading}
              aria-label={singleStep ? 'Run research' : 'Configure search'}
              className="flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-full border border-accent/40 bg-accent text-white shadow-[0_0_24px_-6px_rgba(91,163,230,0.55)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9 sm:self-center"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" aria-hidden />
              ) : (
                <ArrowRight size={18} strokeWidth={2.25} aria-hidden />
              )}
            </button>
          </div>
          </div>

        <div className="mt-3 flex justify-center">
          <Link
            href="/admin/strategy-lab"
            className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border/80 bg-surface-hover/45 px-2.5 py-1.5 text-[11px] font-medium text-text-secondary shadow-sm transition hover:border-accent/35 hover:bg-surface-hover hover:text-text-primary"
          >
            <Compass size={12} className="shrink-0 text-text-muted" aria-hidden />
            Go to Strategy lab
          </Link>
        </div>

        {contextMode === 'url' && url && (
          <p className="mt-4 text-center text-xs text-text-muted">
            URL will be scraped for brand context (not saved to the knowledge base)
          </p>
        )}

        {error && singleStep && (
          <p className="mt-4 text-center text-sm text-red-400">{error}</p>
        )}

        {!singleStep && (
          <p className="mt-4 text-center text-xs text-text-muted">
            Next step: configure platforms and depth for this search.
          </p>
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
);

ResearchTopicForm.displayName = 'ResearchTopicForm';
