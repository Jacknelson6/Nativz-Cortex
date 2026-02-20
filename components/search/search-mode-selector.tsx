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
              <ClientPickerTrigger
                clients={clients}
                value={brandClientId}
                onChange={setBrandClientId}
                disabled={anyLoading}
                placeholder="Select a client"
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
              <ClientPickerTrigger
                clients={clients}
                value={topicClientId}
                onChange={setTopicClientId}
                placeholder="Attach to a client (optional)"
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
          className={`flex w-full items-center gap-2.5 rounded-xl border border-nativz-border bg-surface-hover px-4 py-3 text-sm text-text-muted hover:border-accent-border hover:text-text-secondary transition-colors ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
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

// ─── Bento client picker modal ──────────────────────────────────────────────

function ClientPickerModal({
  clients,
  value,
  onSelect,
  onClose,
}: {
  clients: ClientOption[];
  value: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close on escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const filtered = search.trim()
    ? clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : clients;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-2xl border border-nativz-border bg-surface shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="p-5 pb-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-text-primary">Select a client</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients..."
              className="w-full rounded-lg border border-nativz-border bg-surface-hover pl-9 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-border focus:outline-none focus:ring-1 focus:ring-accent-border transition-colors"
            />
          </div>
        </div>

        {/* Bento grid */}
        <div className="px-5 pb-5 max-h-[50vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Search size={20} className="text-text-muted mb-2" />
              <p className="text-sm text-text-muted">No clients match &ldquo;{search}&rdquo;</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filtered.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => onSelect(client.id)}
                  className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-sm transition-all hover:scale-[1.02] active:scale-[0.98] ${
                    client.id === value
                      ? 'border-accent/50 bg-accent-surface text-accent-text font-medium shadow-[0_0_12px_rgba(4,107,210,0.15)]'
                      : 'border-nativz-border-light bg-surface-hover text-text-secondary hover:border-accent/30 hover:bg-accent-surface/30'
                  }`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    client.id === value ? 'bg-accent/20' : 'bg-surface'
                  }`}>
                    <Building2 size={14} className={client.id === value ? 'text-accent-text' : 'text-text-muted'} />
                  </div>
                  <span className="truncate">{client.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
