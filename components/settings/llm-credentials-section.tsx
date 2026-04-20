'use client';

import { useState, useEffect } from 'react';
import { Loader2, Check, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { LlmProviderKeyBucket } from '@/lib/ai/provider-keys';

type Masked = { configured: boolean; masked: string | null };
type MaskedBlock = Record<LlmProviderKeyBucket, Masked>;

const ALL_BUCKETS: LlmProviderKeyBucket[] = ['default', 'topic_search', 'nerd'];

/**
 * Picks the most-likely-current OpenRouter key out of the legacy 3-bucket
 * storage (default / topic_search / nerd). Prefers `default`, falls back to
 * any bucket that has a value. After the first save through this UI all three
 * buckets converge to the same key.
 */
function pickRepresentativeKey(block: MaskedBlock): Masked {
  if (block.default.configured) return block.default;
  for (const b of ALL_BUCKETS) {
    if (block[b].configured) return block[b];
  }
  return { configured: false, masked: null };
}

/**
 * Single-key OpenRouter credentials UI. Saves the same key to every legacy
 * bucket (default / topic_search / nerd) so the whole pipeline reads from one
 * source. Drops the OpenAI direct path from the UI — paste an `openai/…` slug
 * in the model picker and OpenRouter will proxy it.
 */
export function LlmCredentialsSection() {
  const [current, setCurrent] = useState<Masked>({ configured: false, masked: null });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings/llm-credentials');
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        const block: MaskedBlock = data.openrouter ?? {
          default: { configured: false, masked: null },
          topic_search: { configured: false, masked: null },
          nerd: { configured: false, masked: null },
        };
        setCurrent(pickRepresentativeKey(block));
      } catch {
        setError('Failed to load API key');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const dirty = input.trim() !== '';

  async function patch(value: string | null) {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      // Fan the key out to every legacy bucket so the loader picks it up
      // regardless of which slot a downstream consumer reads from.
      const openrouter = ALL_BUCKETS.reduce<Record<string, string | null>>(
        (acc, b) => ({ ...acc, [b]: value }),
        {},
      );
      const res = await fetch('/api/settings/llm-credentials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openrouter }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      const data = await res.json();
      const block: MaskedBlock = data.openrouter ?? {
        default: { configured: false, masked: null },
        topic_search: { configured: false, masked: null },
        nerd: { configured: false, masked: null },
      };
      setCurrent(pickRepresentativeKey(block));
      setInput('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
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

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">OpenRouter API key</h2>
            <p className="mt-1 text-xs text-text-muted">
              One key drives every model call across Cortex. Stored encrypted; falls back to the{' '}
              <code className="font-mono text-text-secondary">OPENROUTER_API_KEY</code> env var if blank.
            </p>
          </div>
          <a
            href="https://openrouter.ai/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-accent-text"
          >
            <ExternalLink size={12} /> Manage keys on OpenRouter
          </a>
        </div>

        <div className="rounded-lg border border-nativz-border/70 bg-surface-hover/25 p-4">
          {current.configured && (
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-mono text-xs text-text-secondary">
                Saved: {current.masked ?? '••••'}
              </p>
              <button
                type="button"
                onClick={() => void patch(null)}
                disabled={saving}
                className="text-xs text-text-muted hover:text-amber-400/90 disabled:opacity-40"
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
            placeholder={current.configured ? 'Replace with a new key…' : 'sk-or-v1-…'}
            className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-nativz-border pt-4">
          <button
            type="button"
            onClick={() => {
              if (!dirty) return;
              void patch(input.trim());
            }}
            disabled={saving || !dirty}
            className="flex items-center gap-2 rounded-lg bg-accent-surface px-5 py-2.5 text-sm font-medium text-accent-text transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : success ? <Check size={14} /> : null}
            {saving ? 'Saving…' : success ? 'Saved' : 'Save API key'}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
          {success && <p className="text-xs text-emerald-400">Key updated.</p>}
        </div>
      </div>
    </Card>
  );
}
