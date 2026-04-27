'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Check, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { LlmProviderKeyBucket } from '@/lib/ai/provider-keys';

type Masked = { configured: boolean; masked: string | null };
type MaskedBlock = Record<LlmProviderKeyBucket, Masked>;

type Provider = 'openrouter' | 'openai';

interface ProviderConfig {
  id: Provider;
  title: string;
  manageHref: string;
  manageLabel: string;
  inputPlaceholder: string;
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  openrouter: {
    id: 'openrouter',
    title: 'OpenRouter API key',
    manageHref: 'https://openrouter.ai/settings/keys',
    manageLabel: 'Manage keys on OpenRouter',
    inputPlaceholder: 'sk-or-v1-…',
  },
  openai: {
    id: 'openai',
    title: 'OpenAI API key',
    manageHref: 'https://platform.openai.com/api-keys',
    manageLabel: 'Manage keys on OpenAI',
    inputPlaceholder: 'sk-…',
  },
};

const ALL_BUCKETS: LlmProviderKeyBucket[] = ['default', 'topic_search', 'nerd'];

/**
 * Picks the most-likely-current key out of the legacy 3-bucket storage
 * (default / topic_search / nerd). Prefers `default`, falls back to any bucket
 * with a value. After the first save through this UI all three buckets
 * converge to the same key.
 */
function pickRepresentativeKey(block: MaskedBlock): Masked {
  if (block.default.configured) return block.default;
  for (const b of ALL_BUCKETS) {
    if (block[b].configured) return block[b];
  }
  return { configured: false, masked: null };
}

const EMPTY_BLOCK: MaskedBlock = {
  default: { configured: false, masked: null },
  topic_search: { configured: false, masked: null },
  nerd: { configured: false, masked: null },
};

interface SharedState {
  blocks: Record<Provider, MaskedBlock>;
}

/**
 * Provider credentials UI — one card per provider with a key-or-no-key
 * indicator + an input. The Vercel mirror still happens server-side on save
 * (so production runtime keeps working), but is intentionally hidden from
 * this view to keep the surface minimal.
 */
export function LlmCredentialsSection() {
  const [state, setState] = useState<SharedState>({
    blocks: { openrouter: EMPTY_BLOCK, openai: EMPTY_BLOCK },
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const applyResponse = useCallback((data: Record<string, unknown>) => {
    const openrouter = (data.openrouter as MaskedBlock | undefined) ?? EMPTY_BLOCK;
    const openai = (data.openai as MaskedBlock | undefined) ?? EMPTY_BLOCK;
    setState({ blocks: { openrouter, openai } });
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings/llm-credentials');
        if (!res.ok) throw new Error('Failed to load');
        applyResponse(await res.json());
      } catch {
        setLoadError('Failed to load API keys');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [applyResponse]);

  if (loading) {
    return (
      <div className="space-y-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card>
        <p className="text-[13px] text-red-400">{loadError}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ProviderKeyPanel
        config={PROVIDERS.openrouter}
        block={state.blocks.openrouter}
        onResponse={applyResponse}
      />
      <ProviderKeyPanel
        config={PROVIDERS.openai}
        block={state.blocks.openai}
        onResponse={applyResponse}
      />
    </div>
  );
}

function CardSkeleton() {
  return (
    <Card>
      <div className="flex animate-pulse items-center gap-3 py-4">
        <div className="h-10 w-10 rounded-xl bg-surface-hover" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-48 rounded bg-surface-hover" />
          <div className="h-3 w-full rounded bg-surface-hover" />
        </div>
      </div>
    </Card>
  );
}

function ProviderKeyPanel({
  config,
  block,
  onResponse,
}: {
  config: ProviderConfig;
  block: MaskedBlock;
  onResponse: (data: Record<string, unknown>) => void;
}) {
  const current = pickRepresentativeKey(block);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = input.trim() !== '';

  async function patch(body: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/settings/llm-credentials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      onResponse(await res.json());
      setInput('');
      setSuccess(successMessage);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function saveFromInput(value: string | null) {
    const fanned = ALL_BUCKETS.reduce<Record<string, string | null>>(
      (acc, b) => ({ ...acc, [b]: value }),
      {},
    );
    await patch({ [config.id]: fanned }, value === null ? 'Key removed.' : 'Key saved.');
  }

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h2 className="text-[15px] font-semibold text-text-primary">{config.title}</h2>
          <a
            href={config.manageHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-text-muted transition-colors hover:text-accent-text"
          >
            <ExternalLink size={12} /> {config.manageLabel}
          </a>
        </div>

        <div className="rounded-lg border border-nativz-border/70 bg-surface-hover/25 p-4">
          {current.configured && (
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-mono text-[12px] text-text-secondary">
                Saved: {current.masked ?? '••••'}
              </p>
              <button
                type="button"
                onClick={() => void saveFromInput(null)}
                disabled={saving}
                className="text-[12px] text-text-muted hover:text-amber-400/90 disabled:opacity-40"
              >
                Remove key
              </button>
            </div>
          )}
          <input
            type="password"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={current.configured ? 'Replace with a new key…' : config.inputPlaceholder}
            className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 font-mono text-[14px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-nativz-border pt-4">
          <button
            type="button"
            onClick={() => {
              if (!dirty) return;
              void saveFromInput(input.trim());
            }}
            disabled={saving || !dirty}
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[14px] font-medium text-[color:var(--accent-contrast)] transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : success ? <Check size={14} /> : null}
            {saving ? 'Saving…' : success ? 'Saved' : 'Save API key'}
          </button>
          {error && <p className="text-[12px] text-red-400">{error}</p>}
          {success && <p className="text-[12px] text-emerald-400">{success}</p>}
        </div>
      </div>
    </Card>
  );
}
