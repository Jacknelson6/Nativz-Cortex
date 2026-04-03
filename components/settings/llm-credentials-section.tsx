'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useState, useEffect } from 'react';
import { Loader2, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { LlmProviderKeyBucket } from '@/lib/ai/provider-keys';

type MaskedBlock = Record<
  LlmProviderKeyBucket,
  { configured: boolean; masked: string | null }
>;

function emptyMasked(): MaskedBlock {
  return {
    default: { configured: false, masked: null },
    topic_search: { configured: false, masked: null },
    nerd: { configured: false, masked: null },
  };
}

function emptyInputs(): Record<LlmProviderKeyBucket, string> {
  return { default: '', topic_search: '', nerd: '' };
}

/** Topic search, agents, and everything else (incl. content ideas) — three keys per provider. */
const ROWS: { bucket: LlmProviderKeyBucket; title: string; hint: string }[] = [
  {
    bucket: 'topic_search',
    title: 'Topic search',
    hint: 'Research and topic pipeline.',
  },
  {
    bucket: 'nerd',
    title: 'Agents',
    hint: 'Nerd and agent chat.',
  },
  {
    bucket: 'default',
    title: 'Everything else',
    hint: 'Default for all other features, including content ideas.',
  },
];

export function LlmCredentialsSection() {
  const [masked, setMasked] = useState<{ openrouter: MaskedBlock; openai: MaskedBlock } | null>(null);
  const [inputs, setInputs] = useState(emptyInputs());
  const [inputsOpenAi, setInputsOpenAi] = useState(emptyInputs());
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
        setMasked({
          openrouter: data.openrouter ?? emptyMasked(),
          openai: data.openai ?? emptyMasked(),
        });
      } catch {
        setError('Failed to load API key settings');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const keyDirty =
    ROWS.some((r) => inputs[r.bucket].trim() !== '') ||
    ROWS.some((r) => inputsOpenAi[r.bucket].trim() !== '');

  async function patchKeys(partial: {
    openrouter?: Partial<Record<LlmProviderKeyBucket, string | null>>;
    openai?: Partial<Record<LlmProviderKeyBucket, string | null>>;
  }) {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/settings/llm-credentials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      const data = await res.json();
      setMasked({
        openrouter: data.openrouter ?? emptyMasked(),
        openai: data.openai ?? emptyMasked(),
      });
      setInputs(emptyInputs());
      setInputsOpenAi(emptyInputs());
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!keyDirty) return;
    const openrouter: Record<string, string | null> = {};
    const openai: Record<string, string | null> = {};
    for (const r of ROWS) {
      const v = inputs[r.bucket].trim();
      if (v) openrouter[r.bucket] = v;
      const vo = inputsOpenAi[r.bucket].trim();
      if (vo) openai[r.bucket] = vo;
    }
    await patchKeys({
      ...(Object.keys(openrouter).length > 0 ? { openrouter } : {}),
      ...(Object.keys(openai).length > 0 ? { openai } : {}),
    });
  }

  async function clearBucket(provider: 'openrouter' | 'openai', bucket: LlmProviderKeyBucket) {
    if (provider === 'openrouter') {
      await patchKeys({ openrouter: { [bucket]: null } });
    } else {
      await patchKeys({ openai: { [bucket]: null } });
    }
  }

  if (loading || !masked) {
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

  function keyRow(
    provider: 'openrouter' | 'openai',
    row: (typeof ROWS)[0],
    inputState: Record<LlmProviderKeyBucket, string>,
    setInputState: Dispatch<SetStateAction<Record<LlmProviderKeyBucket, string>>>,
    block: MaskedBlock,
    placeholder: string,
  ) {
    return (
      <div key={`${provider}-${row.bucket}`} className="rounded-lg border border-nativz-border/70 bg-surface-hover/25 p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{row.title}</span>
          {block[row.bucket].configured && (
            <button
              type="button"
              onClick={() => void clearBucket(provider, row.bucket)}
              className="text-xs text-text-muted hover:text-amber-400/90"
            >
              Remove key
            </button>
          )}
        </div>
        <p className="mb-3 text-xs text-text-muted">{row.hint}</p>
        {block[row.bucket].configured && (
          <p className="mb-2 font-mono text-xs text-text-secondary">
            Saved: {block[row.bucket].masked ?? '••••'}
          </p>
        )}
        <input
          type="password"
          autoComplete="off"
          value={inputState[row.bucket]}
          onChange={(e) =>
            setInputState((prev) => ({ ...prev, [row.bucket]: e.target.value }))
          }
          placeholder={block[row.bucket].configured ? 'Replace with a new key…' : placeholder}
          className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/30"
        />
      </div>
    );
  }

  return (
    <Card>
      <div className="space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">API keys</h2>
          <p className="mt-1 text-xs text-text-muted">
            Three slots per provider: topic search, agents, and everything else. Empty rows use the next fallback, then
            env vars. Stored encrypted.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            <h3 className="text-xs font-medium text-text-secondary">OpenRouter</h3>
            {ROWS.map((row) =>
              keyRow('openrouter', row, inputs, setInputs, masked.openrouter, 'sk-or-v1-…'),
            )}
          </div>
          <div className="space-y-4">
            <h3 className="text-xs font-medium text-text-secondary">OpenAI (direct)</h3>
            {ROWS.map((row) =>
              keyRow('openai', row, inputsOpenAi, setInputsOpenAi, masked.openai, 'sk-… or sk-proj-…'),
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-nativz-border pt-4">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !keyDirty}
            className="flex items-center gap-2 rounded-lg bg-accent-surface px-5 py-2.5 text-sm font-medium text-accent-text transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : success ? <Check size={14} /> : null}
            {saving ? 'Saving…' : success ? 'Saved' : 'Save API keys'}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
          {success && <p className="text-xs text-emerald-400">Keys updated.</p>}
        </div>
      </div>
    </Card>
  );
}
