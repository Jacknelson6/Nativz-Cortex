'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Search, Sparkles, TrendingUp } from 'lucide-react';
import { GlassButton } from '@/components/ui/glass-button';
import { ClientPickerModal, type ClientOption } from '@/components/ui/client-picker';
import { createClient } from '@/lib/supabase/client';
import { PLATFORM_CONFIG } from '@/components/search/platform-icon';
import type { SearchPlatform } from '@/lib/types/search';

/** Fixed platforms for every search — no user selection. */
const FIXED_PLATFORMS: SearchPlatform[] = ['web', 'reddit', 'tiktok', 'youtube'];

interface SearchModeSelectorProps {
  redirectPrefix: string;
  fixedClientId?: string | null;
  fixedClientName?: string | null;
  portalMode?: boolean;
  initialClients?: ClientOption[];
}

export function SearchModeSelector({
  redirectPrefix,
  fixedClientId,
  fixedClientName,
  portalMode = false,
  initialClients,
}: SearchModeSelectorProps) {
  // Brand card state
  const [brandClientId, setBrandClientId] = useState<string | null>(fixedClientId ?? null);
  const [brandLoading, setBrandLoading] = useState(false);

  // Topic card state
  const [topicQuery, setTopicQuery] = useState('');
  const [topicClientId, setTopicClientId] = useState<string | null>(null);
  const [topicLoading, setTopicLoading] = useState(false);

  // Shared state
  const [clients, setClients] = useState<ClientOption[]>(initialClients || []);
  const [error, setError] = useState('');
  const router = useRouter();
  const topicInputRef = useRef<HTMLInputElement>(null);

  // Fetch clients (admin only)
  useEffect(() => {
    if (portalMode || initialClients) return;
    async function fetchClients() {
      const supabase = createClient();
      const { data } = await supabase
        .from('clients')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (data) setClients(data);
    }
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialClients only gates mount fetch when provided by parent
  }, [portalMode]);

  const selectedBrandClient = clients.find((c) => c.id === brandClientId);
  const brandClientName = fixedClientName || selectedBrandClient?.name;

  async function handleBrandSearch() {
    if (!brandClientId || !brandClientName) return;
    setError('');
    setBrandLoading(true);

    try {
      const res = await fetch('/api/search/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: brandClientName,
          source: 'all',
          time_range: 'last_3_months',
          language: 'all',
          country: 'us',
          client_id: brandClientId,
          search_mode: 'client_strategy',
          platforms: [...FIXED_PLATFORMS],
          volume: 'medium',
        }),
      });

      const data = (await res.json()) as {
        id?: string;
        topic_pipeline?: string;
        error?: string;
        details?: unknown;
      };
      if (!res.ok) {
        setError(data.details ? `${data.error}: ${data.details}` : (data.error || 'Search failed. Try again.'));
        setBrandLoading(false);
        return;
      }
      const id = data.id as string;
      const subtopicsFirst =
        data.topic_pipeline === 'llm_v1' && redirectPrefix === '/admin';
      router.push(
        `${redirectPrefix}/search/${id}/${subtopicsFirst ? 'subtopics' : 'processing'}`,
      );
    } catch {
      setError('Something went wrong. Try again.');
      setBrandLoading(false);
    }
  }

  async function handleTopicSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!topicQuery.trim()) return;
    setError('');
    setTopicLoading(true);

    try {
      const clientForTopic = topicClientId || fixedClientId || null;
      const res = await fetch('/api/search/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: topicQuery.trim(),
          source: 'all',
          time_range: 'last_3_months',
          language: 'all',
          country: 'us',
          client_id: clientForTopic,
          search_mode: 'general',
          platforms: [...FIXED_PLATFORMS],
          volume: 'medium',
        }),
      });

      const data = (await res.json()) as {
        id?: string;
        topic_pipeline?: string;
        error?: string;
        details?: unknown;
      };
      if (!res.ok) {
        setError(data.details ? `${data.error}: ${data.details}` : (data.error || 'Search failed. Try again.'));
        setTopicLoading(false);
        return;
      }
      const id = data.id as string;
      const subtopicsFirst =
        data.topic_pipeline === 'llm_v1' && redirectPrefix === '/admin';
      router.push(
        `${redirectPrefix}/search/${id}/${subtopicsFirst ? 'subtopics' : 'processing'}`,
      );
    } catch {
      setError('Something went wrong. Try again.');
      setTopicLoading(false);
    }
  }

  const anyLoading = brandLoading || topicLoading;

  return (
    <div className="w-full">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="ui-page-title-hero">What would you like to research today?</h1>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-0 items-stretch max-w-3xl mx-auto">
        {/* Brand intel card */}
        <div className="flex flex-col rounded-xl border border-nativz-border bg-surface p-7 transition-colors hover:border-nativz-border/80">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-surface">
              <Building2 size={16} className="text-accent-text" />
            </div>
            <h2 className="text-base font-semibold text-text-primary">Brand intel</h2>
          </div>
          <p className="text-sm text-text-muted mb-6 ml-[42px]">
            What are people saying about your brand?
          </p>

          <div className="flex flex-col flex-1 space-y-4">
            {/* Client selector */}
            {portalMode ? (
              <div className="flex items-center gap-2 rounded-xl border border-nativz-border bg-surface px-3.5 py-3">
                <Building2 size={16} className="text-text-muted" />
                <span className="text-sm text-text-primary">{fixedClientName}</span>
              </div>
            ) : (
                <ClientPickerTrigger
                  clients={clients}
                  value={brandClientId}
                  onChange={setBrandClientId}
                  disabled={anyLoading}
                  placeholder="Select a client"
                />
            )}

            {/* Static platform display */}
            <PlatformBadges />

            {/* Spacer pushes button to bottom */}
            <div className="flex-1" />

            {/* Submit */}
            <GlassButton
              className="w-full"
              onClick={handleBrandSearch}
              loading={brandLoading}
              disabled={anyLoading || !brandClientId}
            >
              <Sparkles size={16} />
              Analyze brand
            </GlassButton>
          </div>
        </div>

        {/* OR divider */}
        <div className="flex items-center justify-center">
          {/* Vertical (desktop) */}
          <div className="hidden md:flex flex-col items-center gap-3 px-6">
            <div className="w-px flex-1 min-h-[40px] bg-nativz-border" />
            <span className="text-xs font-medium text-text-muted uppercase tracking-widest">
              or
            </span>
            <div className="w-px flex-1 min-h-[40px] bg-nativz-border" />
          </div>
          {/* Horizontal (mobile) */}
          <div className="flex md:hidden items-center gap-3 w-full py-6">
            <div className="h-px flex-1 bg-nativz-border" />
            <span className="text-xs font-medium text-text-muted uppercase tracking-widest">
              or
            </span>
            <div className="h-px flex-1 bg-nativz-border" />
          </div>
        </div>

        {/* Topic research card */}
        <form
          onSubmit={handleTopicSearch}
          className="rounded-xl border border-nativz-border bg-surface p-7 transition-colors hover:border-nativz-border/80"
        >
          <div className="flex items-center gap-2.5 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-surface">
              <TrendingUp size={16} className="text-accent-text" />
            </div>
            <h2 className="text-base font-semibold text-text-primary">Topic research</h2>
          </div>
          <p className="text-sm text-text-muted mb-6 ml-[42px]">
            What are people saying about a topic?
          </p>

          <div className="space-y-4">
            {/* Topic input */}
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                ref={topicInputRef}
                type="text"
                value={topicQuery}
                onChange={(e) => setTopicQuery(e.target.value)}
                placeholder="Search a topic..."
                className="w-full rounded-xl border border-nativz-border bg-surface py-3 pl-10 pr-4 text-sm text-text-primary placeholder-text-muted transition-colors focus:border-accent focus:outline-none"
                disabled={anyLoading}
              />
            </div>

            {/* Optional client */}
            {!portalMode && (
              <ClientPickerTrigger
                clients={clients}
                value={topicClientId}
                onChange={setTopicClientId}
                placeholder="Attach to a client (optional)"
                disabled={anyLoading}
              />
            )}

            {/* Static platform display */}
            <PlatformBadges />

            {/* Submit */}
            <GlassButton
              className="w-full"
              type="submit"
              loading={topicLoading}
              disabled={anyLoading || !topicQuery.trim()}
            >
              <Search size={16} />
              Research topic
            </GlassButton>
          </div>
        </form>
      </div>

      {/* Error */}
      {error && (
        <p className="mt-4 text-center text-sm text-red-400">{error}</p>
      )}

    </div>
  );
}

// ─── Static platform badges (read-only) ─────────────────────────────────────

function PlatformBadges() {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FIXED_PLATFORMS.map((p) => {
        const config = PLATFORM_CONFIG[p];
        if (!config) return null;
        const Icon = config.icon;
        return (
          <span
            key={p}
            className="inline-flex items-center gap-1.5 rounded-lg bg-surface-hover px-2.5 py-1 text-xs font-medium text-text-secondary"
          >
            <Icon size={12} />
            {config.label}
          </span>
        );
      })}
    </div>
  );
}

// ─── Client picker trigger (opens bento modal) ─────────────────────────────

function ClientPickerTrigger({
  clients,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  clients: ClientOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = clients.find((c) => c.id === value);

  return (
    <>
      {value && selected ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="flex w-full items-center gap-2.5 rounded-xl border border-accent/40 bg-accent-surface/50 px-4 py-3 text-sm font-medium text-accent-text hover:bg-accent-surface/70 transition-colors"
        >
          <Building2 size={16} />
          <span className="flex-1 text-left">{selected.name}</span>
          <svg className="h-3.5 w-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => !disabled && setOpen(true)}
          className={`flex w-full items-center gap-2.5 rounded-xl border border-nativz-border bg-surface px-4 py-3 text-sm text-text-muted hover:border-nativz-border/80 hover:text-text-secondary transition-colors ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <Building2 size={16} />
          <span className="flex-1 text-left">{placeholder}</span>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {open && (
        <ClientPickerModal
          clients={clients}
          value={value}
          onSelect={(id) => {
            onChange(id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
