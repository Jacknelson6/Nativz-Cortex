'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Search, Link as LinkIcon, Loader2, AlertCircle, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { WizardShell } from './wizard-shell';
import { GlassButton } from '@/components/ui/glass-button';
import { ClientPickerButton, type ClientOption } from '@/components/ui/client-picker';
import { PLATFORM_CONFIG } from '@/components/search/platform-icon';
import { PLATFORM_OPTIONS } from '@/lib/types/search';
import type { SearchPlatform, SearchVolume } from '@/lib/types/search';

type ContextMode = 'none' | 'client' | 'url';

interface ResearchWizardProps {
  open: boolean;
  onClose: () => void;
  clients: ClientOption[];
  onStarted?: (item: { id: string; query: string; mode: string; clientName: string | null }) => void;
}

const DEPTH_OPTIONS: { value: 'light' | 'medium' | 'deep'; label: string; tip: string }[] = [
  { value: 'light', label: 'Light', tip: '~20 sources · Fast scan' },
  { value: 'medium', label: 'Medium', tip: '~100 sources · Recommended' },
  { value: 'deep', label: 'Deep', tip: '500+ sources · Full analysis' },
];

export function ResearchWizard({ open, onClose, clients, onStarted }: ResearchWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [topicQuery, setTopicQuery] = useState('');
  const [contextMode, setContextMode] = useState<ContextMode>('none');
  const [clientId, setClientId] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [platforms, setPlatforms] = useState<Set<SearchPlatform>>(new Set(['web', 'reddit', 'youtube', 'tiktok']));
  const [volume, setVolume] = useState<SearchVolume>('medium');
  const [platformAvailability, setPlatformAvailability] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/search/platforms')
      .then((r) => r.ok ? r.json() : {})
      .then(setPlatformAvailability)
      .catch(() => {});
  }, []);

  const selectedClient = clients.find((c) => c.id === clientId);
  const step1Valid = topicQuery.trim().length > 0 && (
    contextMode === 'none' ||
    (contextMode === 'client' && !!clientId) ||
    (contextMode === 'url' && url.trim().length > 0)
  );

  function reset() {
    setStep(1);
    setTopicQuery('');
    setContextMode('none');
    setClientId(null);
    setUrl('');
    setPlatforms(new Set(['web', 'reddit', 'youtube', 'tiktok']));
    setVolume('medium');
    setLoading(false);
    setError('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    setError('');
    setLoading(true);

    try {
      const searchMode = contextMode === 'client' ? 'client_strategy' : 'general';

      const body = {
        query: topicQuery.trim(),
        source: 'all',
        time_range: 'last_3_months',
        language: 'all',
        country: 'us',
        client_id: contextMode === 'client' ? clientId : null,
        search_mode: searchMode,
        platforms: Array.from(platforms),
        volume,
        // Pass URL for on-the-fly brand context (not saved to KB)
        ...(contextMode === 'url' && url.trim() ? { brand_url: url.trim() } : {}),
      };

      const res = await fetch('/api/search/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Search failed');
        setLoading(false);
        return;
      }

      onStarted?.({
        id: data.id,
        query: topicQuery.trim(),
        mode: searchMode,
        clientName: selectedClient?.name ?? null,
      });
      handleClose();
      router.push(`/admin/search/${data.id}/processing`);
    } catch {
      setError('Something went wrong. Try again.');
      setLoading(false);
    }
  }

  // Summary text for step 2
  const contextLabel = contextMode === 'client' && selectedClient
    ? ` · ${selectedClient.name}`
    : contextMode === 'url' && url
      ? ` · ${new URL(url.startsWith('http') ? url : `https://${url}`).hostname}`
      : '';

  return (
    <WizardShell
      open={open}
      onClose={handleClose}
      accentColor="#5ba3e6"
      totalSteps={2}
      currentStep={step}
    >
      {/* ── Step 1: Topic + Context ─────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">What are you researching?</h2>
        <p className="text-sm text-text-muted mb-5">Enter a topic, then optionally add brand context</p>

        {/* Topic input — always visible */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={topicQuery}
            onChange={(e) => setTopicQuery(e.target.value)}
            placeholder="e.g. vodka seltzer trends, AI video editing tools..."
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder-white/40 focus:border-accent focus:outline-none"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && step1Valid) setStep(2); }}
          />
        </div>

        {/* Context mode selector */}
        <div className="mb-3">
          <span className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">Brand context (optional)</span>
          <div className="flex gap-2">
            {([
              { mode: 'none' as const, icon: Search, label: 'No context', desc: 'Topic search only' },
              { mode: 'client' as const, icon: Building2, label: 'Client', desc: 'From knowledge base' },
              { mode: 'url' as const, icon: Globe, label: 'URL', desc: 'Scrape on-the-fly' },
            ]).map(({ mode, icon: Icon, label, desc }) => (
              <button
                key={mode}
                type="button"
                onClick={() => { setContextMode(mode); if (mode !== 'client') setClientId(null); if (mode !== 'url') setUrl(''); }}
                className={`flex-1 rounded-xl border p-3 text-left transition-all ${
                  contextMode === mode
                    ? 'border-accent/40 bg-accent-surface/30'
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                } cursor-pointer`}
              >
                <Icon size={14} className={contextMode === mode ? 'text-accent-text mb-1.5' : 'text-text-muted mb-1.5'} />
                <p className={`text-xs font-medium ${contextMode === mode ? 'text-accent-text' : 'text-text-secondary'}`}>{label}</p>
                <p className="text-[10px] text-text-muted">{desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Context input */}
        {contextMode === 'client' && (
          <div className="mt-3">
            <ClientPickerButton
              clients={clients}
              value={clientId}
              onChange={setClientId}
              placeholder="Select a client"
            />
          </div>
        )}

        {contextMode === 'url' && (
          <div className="relative mt-3">
            <LinkIcon size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/40 focus:border-accent focus:outline-none"
              onKeyDown={(e) => { if (e.key === 'Enter' && step1Valid) setStep(2); }}
            />
            <p className="text-[10px] text-text-muted mt-1.5 ml-1">Brand DNA will be scraped for context but not saved</p>
          </div>
        )}

        <div className="flex justify-end mt-6">
          <GlassButton onClick={() => setStep(2)} disabled={!step1Valid}>
            Next &rarr;
          </GlassButton>
        </div>
      </div>

      {/* ── Step 2: Platforms + Depth + Confirm ─────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Configure search</h2>
        <p className="text-sm text-text-muted mb-5">Researching &ldquo;{topicQuery}&rdquo;{contextLabel}</p>

        {/* Platform toggles */}
        <div className="mb-4">
          <span className="block text-xs font-medium text-text-muted mb-2">Platforms</span>
          <div className="flex flex-wrap gap-1.5">
            {PLATFORM_OPTIONS.filter((p) => p.available).map((p) => {
              const config = PLATFORM_CONFIG[p.value];
              const Icon = config.icon;
              const isConfigured = platformAvailability[p.value] !== false;
              const isActive = platforms.has(p.value);
              const isWeb = p.value === 'web';

              return (
                <button
                  key={p.value}
                  type="button"
                  title={!isConfigured ? `${p.label} — API key not configured` : undefined}
                  onClick={() => {
                    if (isWeb || !isConfigured) return;
                    setPlatforms((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.value)) next.delete(p.value);
                      else next.add(p.value);
                      return next;
                    });
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    !isConfigured
                      ? 'bg-white/[0.03] text-text-muted/40 border border-white/[0.06] cursor-not-allowed'
                      : isActive
                        ? 'bg-accent-surface text-accent-text'
                        : isWeb
                          ? 'bg-accent-surface/50 text-accent-text/60 cursor-default'
                          : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08] hover:text-text-secondary border border-white/[0.06] cursor-pointer'
                  }`}
                >
                  {!isConfigured ? (
                    <AlertCircle size={12} className="text-amber-500/60" />
                  ) : (
                    <Icon size={12} className={isActive ? config.color : ''} />
                  )}
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Depth selector with tooltips */}
        <div className="mb-5">
          <span className="block text-xs font-medium text-text-muted mb-2">Depth</span>
          <div className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-0.5 w-fit">
            {DEPTH_OPTIONS.map((opt) => (
              <div key={opt.value} className="relative group">
                <button
                  type="button"
                  onClick={() => setVolume(opt.value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    volume === opt.value ? 'bg-white/[0.08] text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {opt.label}
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-md bg-[#1a1d27] border border-white/[0.08] text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg">
                  {opt.tip}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-[#1a1d27]" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary card */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-surface">
              <Search size={18} className="text-accent-text" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">{topicQuery}</p>
              <p className="text-xs text-text-muted">
                {contextMode === 'client' && selectedClient ? `${selectedClient.name} · ` : ''}
                {contextMode === 'url' && url ? 'URL context · ' : ''}
                {platforms.size} platform{platforms.size !== 1 ? 's' : ''} · {DEPTH_OPTIONS.find(d => d.value === volume)?.label}
              </p>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="text-sm text-text-muted hover:text-text-secondary transition-colors"
          >
            &larr; Back
          </button>
          <GlassButton onClick={handleSubmit} loading={loading} disabled={loading}>
            {loading ? <><Loader2 size={16} className="animate-spin" /> Running...</> : 'Run research'}
          </GlassButton>
        </div>
      </div>
    </WizardShell>
  );
}
