'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, AlertCircle } from 'lucide-react';
import { WizardShell } from './wizard-shell';
import { GlassButton } from '@/components/ui/glass-button';
import type { ClientOption } from '@/components/ui/client-picker';
import { PLATFORM_CONFIG } from '@/components/search/platform-icon';
import { PLATFORM_OPTIONS } from '@/lib/types/search';
import type { SearchPlatform, SearchVolume } from '@/lib/types/search';
import type { ResearchTopicSnapshot } from './research-topic-form';

const DEPTH_OPTIONS: { value: 'light' | 'medium' | 'deep'; label: string; tip: string }[] = [
  { value: 'light', label: 'Light', tip: '~20 sources · Fast scan' },
  { value: 'medium', label: 'Medium', tip: '~100 sources · Recommended' },
  { value: 'deep', label: 'Deep', tip: '500+ sources · Full analysis' },
];

interface ResearchWizardProps {
  open: boolean;
  onClose: () => void;
  clients: ClientOption[];
  /** Snapshot from inline topic + brand step (legacy pipeline only) */
  step1Snapshot: ResearchTopicSnapshot | null;
  topicPipelineLlmV1: boolean;
  onStarted?: (item: {
    id: string;
    query: string;
    mode: string;
    clientName: string | null;
    needsSubtopics?: boolean;
  }) => void;
}

/**
 * Legacy pipeline only: platform + depth configuration after the inline topic form.
 * When topicPipelineLlmV1 is true, the hub does not mount this component.
 */
export function ResearchWizard({
  open,
  onClose,
  clients,
  step1Snapshot,
  topicPipelineLlmV1,
  onStarted,
}: ResearchWizardProps) {
  const router = useRouter();
  const [platforms, setPlatforms] = useState<Set<SearchPlatform>>(
    () => new Set(['web', 'reddit', 'youtube', 'tiktok'])
  );
  const [volume, setVolume] = useState<SearchVolume>('medium');
  const [platformAvailability, setPlatformAvailability] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/search/platforms')
      .then((r) => (r.ok ? r.json() : {}))
      .then(setPlatformAvailability)
      .catch(() => {});
  }, []);

  const snap = step1Snapshot;
  const selectedClient = snap?.clientId ? clients.find((c) => c.id === snap.clientId) : undefined;

  let urlHostname = '';
  if (snap?.contextMode === 'url' && snap.url) {
    try {
      urlHostname = new URL(snap.url.startsWith('http') ? snap.url : `https://${snap.url}`).hostname;
    } catch {
      urlHostname = '';
    }
  }

  const contextLabel =
    snap?.contextMode === 'client' && selectedClient
      ? ` · ${selectedClient.name}`
      : snap?.contextMode === 'url' && urlHostname
        ? ` · ${urlHostname}`
        : '';

  function handleClose() {
    setError('');
    setLoading(false);
    onClose();
  }

  async function handleSubmit() {
    if (!snap) return;
    setError('');
    setLoading(true);
    try {
      const searchMode = snap.contextMode === 'client' ? 'client_strategy' : 'general';
      const body = {
        query: snap.topicQuery.trim(),
        source: 'all',
        time_range: snap.timeRange ?? 'last_3_months',
        language: snap.language ?? 'all',
        country: snap.country ?? 'us',
        client_id: snap.contextMode === 'client' ? snap.clientId : null,
        search_mode: searchMode,
        platforms: Array.from(platforms),
        volume,
        ...(snap.contextMode === 'url' && snap.url.trim() ? { brand_url: snap.url.trim() } : {}),
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
        query: snap.topicQuery.trim(),
        mode: searchMode,
        clientName: selectedClient?.name ?? null,
        needsSubtopics,
      });
      const dest = needsSubtopics
        ? `/admin/search/${data.id}/subtopics`
        : `/admin/search/${data.id}/processing`;
      router.push(dest);
      queueMicrotask(() => handleClose());
    } catch {
      setError('Something went wrong. Try again.');
      setLoading(false);
    }
  }

  if (topicPipelineLlmV1) return null;
  if (!open || !snap) return null;

  return (
    <WizardShell open={open} onClose={handleClose} accentColor="var(--accent)" totalSteps={2} currentStep={2}>
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Configure search</h2>
        <p className="text-sm text-text-muted mb-5">
          Researching &ldquo;{snap.topicQuery}&rdquo;{contextLabel}
        </p>

        <div className="mb-4">
          <span className="block text-xs font-medium text-text-muted mb-2">Platforms</span>
          <div className="grid grid-cols-2 gap-2">
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
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-all ${
                    !isConfigured
                      ? 'bg-surface text-text-muted/40 border border-nativz-border cursor-not-allowed'
                      : isActive
                        ? 'bg-surface-hover border border-accent/30 text-text-primary'
                        : 'bg-surface text-text-muted hover:bg-surface-hover border border-nativz-border cursor-pointer'
                  }`}
                >
                  {!isConfigured ? (
                    <AlertCircle size={14} className="text-amber-500/60" />
                  ) : (
                    <Icon size={14} className={config.color} />
                  )}
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-5">
          <span className="block text-xs font-medium text-text-muted mb-2">Depth</span>
          <div className="flex items-center gap-1 rounded-lg bg-surface-hover p-0.5 w-fit">
            {DEPTH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setVolume(opt.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  volume === opt.value
                    ? 'bg-surface text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-text-muted mt-1.5">
            {DEPTH_OPTIONS.find((d) => d.value === volume)?.tip}
          </p>
        </div>

        <div className="rounded-xl border border-nativz-border bg-surface p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-surface">
              <Search size={18} className="text-accent-text" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">{snap.topicQuery}</p>
              <p className="text-xs text-text-muted">
                {snap.contextMode === 'client' && selectedClient ? `${selectedClient.name} · ` : ''}
                {snap.contextMode === 'url' && snap.url ? 'URL context · ' : ''}
                {platforms.size} platform{platforms.size !== 1 ? 's' : ''} ·{' '}
                {DEPTH_OPTIONS.find((d) => d.value === volume)?.label}
              </p>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <div className="flex justify-between">
          <button
            type="button"
            onClick={handleClose}
            className="text-sm text-text-muted hover:text-text-secondary transition-colors"
          >
            &larr; Back
          </button>
          <GlassButton onClick={() => void handleSubmit()} loading={loading} disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Running...
              </>
            ) : (
              'Run research'
            )}
          </GlassButton>
        </div>
      </div>
    </WizardShell>
  );
}
