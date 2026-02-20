'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Search, Sparkles, TrendingUp } from 'lucide-react';
import { GlassButton } from '@/components/ui/glass-button';
import { createClient } from '@/lib/supabase/client';

interface ClientOption {
  id: string;
  name: string;
}

interface SearchModeSelectorProps {
  redirectPrefix: string;
  fixedClientId?: string | null;
  fixedClientName?: string | null;
  portalMode?: boolean;
}

export function SearchModeSelector({
  redirectPrefix,
  fixedClientId,
  fixedClientName,
  portalMode = false,
}: SearchModeSelectorProps) {
  // Brand card state
  const [brandClientId, setBrandClientId] = useState<string | null>(fixedClientId ?? null);
  const [brandLoading, setBrandLoading] = useState(false);

  // Topic card state
  const [topicQuery, setTopicQuery] = useState('');
  const [topicClientId, setTopicClientId] = useState<string | null>(null);
  const [topicLoading, setTopicLoading] = useState(false);

  // Shared state
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [error, setError] = useState('');
  const router = useRouter();
  const topicInputRef = useRef<HTMLInputElement>(null);

  // Fetch clients (admin only)
  useEffect(() => {
    if (portalMode) return;
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
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.details ? `${data.error}: ${data.details}` : (data.error || 'Search failed. Try again.'));
        setBrandLoading(false);
        return;
      }
      router.push(`${redirectPrefix}/search/${data.id}/processing`);
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
          search_mode: clientForTopic ? 'client_strategy' : 'general',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.details ? `${data.error}: ${data.details}` : (data.error || 'Search failed. Try again.'));
        setTopicLoading(false);
        return;
      }
      router.push(`${redirectPrefix}/search/${data.id}/processing`);
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
        <h1 className="text-3xl font-bold text-text-primary">Research</h1>
        <p className="mt-3 text-text-muted">
          What would you like to research today?
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-0 items-stretch">
        {/* Brand intel card */}
        <div className="rounded-2xl border border-nativz-border bg-surface p-6 transition-colors hover:border-[rgba(4,107,210,0.3)]">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-surface">
              <Building2 size={16} className="text-accent-text" />
            </div>
            <h2 className="text-base font-semibold text-text-primary">Brand intel</h2>
          </div>
          <p className="text-sm text-text-muted mb-6 ml-[42px]">
            What are people saying about your brand?
          </p>

          <div className="space-y-4">
            {/* Client selector */}
            {portalMode ? (
              <div className="flex items-center gap-2 rounded-xl border border-nativz-border bg-surface-hover px-3.5 py-3">
                <Building2 size={16} className="text-text-muted" />
                <span className="text-sm text-text-primary">{fixedClientName}</span>
              </div>
            ) : (
              <ClientDropdown
                clients={clients}
                value={brandClientId}
                onChange={setBrandClientId}
                disabled={anyLoading}
              />
            )}

            {/* Submit */}
            <GlassButton
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
            <span className="text-xs font-medium text-text-muted uppercase tracking-widest bg-background px-2 py-1 rounded-full border border-nativz-border">
              or
            </span>
            <div className="w-px flex-1 min-h-[40px] bg-nativz-border" />
          </div>
          {/* Horizontal (mobile) */}
          <div className="flex md:hidden items-center gap-3 w-full py-6">
            <div className="h-px flex-1 bg-nativz-border" />
            <span className="text-xs font-medium text-text-muted uppercase tracking-widest bg-background px-2 py-1 rounded-full border border-nativz-border">
              or
            </span>
            <div className="h-px flex-1 bg-nativz-border" />
          </div>
        </div>

        {/* Topic research card */}
        <form
          onSubmit={handleTopicSearch}
          className="rounded-2xl border border-nativz-border bg-surface p-6 transition-colors hover:border-[rgba(4,107,210,0.3)]"
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
                className="w-full rounded-xl border border-nativz-border bg-surface-hover py-3 pl-10 pr-4 text-sm text-text-primary placeholder-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_3px_rgba(4,107,210,0.15)]"
                disabled={anyLoading}
              />
            </div>

            {/* Optional client */}
            {!portalMode && (
              <TopicClientAttach
                clients={clients}
                value={topicClientId}
                onChange={setTopicClientId}
              />
            )}

            {/* Submit */}
            <GlassButton
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

      {/* Footer */}
      <p className="mt-8 text-center text-xs text-text-muted">
        Powered by Brave Search + Claude AI
      </p>
    </div>
  );
}

// ─── Client dropdown for brand card ──────────────────────────────────────────

function ClientDropdown({
  clients,
  value,
  onChange,
  disabled,
}: {
  clients: ClientOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = clients.find((c) => c.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        className={`flex w-full items-center gap-2 rounded-xl border px-3.5 py-3 text-left text-sm transition-colors ${
          selected
            ? 'border-accent/30 bg-accent-surface/50 text-text-primary'
            : 'border-nativz-border bg-surface-hover text-text-muted hover:border-text-muted'
        } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <Building2 size={16} className={selected ? 'text-accent-text' : 'text-text-muted'} />
        <span className="flex-1 truncate">{selected ? selected.name : 'Select a client'}</span>
        <svg
          className={`h-4 w-4 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-full max-h-[200px] overflow-y-auto rounded-xl border border-nativz-border bg-surface py-1 shadow-dropdown animate-fade-in">
          {clients.length === 0 ? (
            <p className="px-3.5 py-2 text-xs text-text-muted">No clients found</p>
          ) : (
            clients.map((client, i) => (
              <button
                key={client.id}
                type="button"
                onClick={() => {
                  onChange(client.id);
                  setOpen(false);
                }}
                className={`animate-stagger-in block w-full px-3.5 py-2 text-left text-sm transition-colors ${
                  client.id === value
                    ? 'bg-accent-surface text-accent-text font-medium'
                    : 'text-text-secondary hover:bg-surface-hover'
                }`}
                style={{ animationDelay: `${i * 20}ms` }}
              >
                {client.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Client attach chip for topic card ───────────────────────────────────────

function TopicClientAttach({
  clients,
  value,
  onChange,
}: {
  clients: ClientOption[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = clients.find((c) => c.id === value);

  if (clients.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      {value && selected ? (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-surface px-3 py-1.5 text-xs font-medium text-accent-text">
          <Building2 size={12} />
          {selected.name}
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-0.5 rounded-full p-0.5 hover:bg-accent/20 transition-colors"
          >
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-nativz-border px-3 py-1.5 text-xs text-text-muted hover:border-text-muted hover:text-text-secondary transition-colors"
        >
          <Building2 size={12} />
          Client
        </button>
      )}

      {open && !value && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[200px] rounded-lg border border-nativz-border bg-surface py-1 shadow-dropdown animate-fade-in">
          {clients.map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => {
                onChange(client.id);
                setOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-hover transition-colors"
            >
              {client.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
