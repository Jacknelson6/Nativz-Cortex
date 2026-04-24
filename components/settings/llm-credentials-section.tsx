'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Check, ExternalLink, Cloud, CloudOff, ArrowDownFromLine } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { LlmProviderKeyBucket } from '@/lib/ai/provider-keys';

type Masked = { configured: boolean; masked: string | null };
type MaskedBlock = Record<LlmProviderKeyBucket, Masked>;

interface VercelMirror {
  available: boolean;
  envKey?: string;
  configured?: boolean;
  masked?: string | null;
  updatedAt?: number | null;
  targets?: string[];
  differsFromDb?: boolean;
  dbEmpty?: boolean;
}

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

function relativeTime(ts: number | null | undefined): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Single-key OpenRouter credentials UI with bi-directional Vercel env sync.
 *
 *   • Type a new key + Save → writes to DB AND pushes up to Vercel's
 *     OPENROUTER_API_KEY env var (production + preview + development).
 *   • "Use Vercel value" button (shown when Vercel's env differs from DB) →
 *     pulls the decrypted Vercel value into the DB so the dashboard matches.
 *
 * This keeps the two storage locations — agency_settings.llm_provider_keys
 * in Postgres, and OPENROUTER_API_KEY on Vercel — from silently drifting.
 */
export function LlmCredentialsSection() {
  const [current, setCurrent] = useState<Masked>({ configured: false, masked: null });
  const [mirror, setMirror] = useState<VercelMirror>({ available: false });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyResponse = useCallback((data: Record<string, unknown>) => {
    const block = (data.openrouter as MaskedBlock | undefined) ?? {
      default: { configured: false, masked: null },
      topic_search: { configured: false, masked: null },
      nerd: { configured: false, masked: null },
    };
    setCurrent(pickRepresentativeKey(block));
    const mirrorBlock =
      (data.vercelMirror as { openrouter?: VercelMirror } | undefined)?.openrouter ?? {
        available: false,
      };
    setMirror(mirrorBlock);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings/llm-credentials');
        if (!res.ok) throw new Error('Failed to load');
        applyResponse(await res.json());
      } catch {
        setError('Failed to load API key');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [applyResponse]);

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
      applyResponse(await res.json());
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
    const openrouter = ALL_BUCKETS.reduce<Record<string, string | null>>(
      (acc, b) => ({ ...acc, [b]: value }),
      {},
    );
    const msg = value === null ? 'Key removed.' : mirror.available
      ? 'Key saved + mirrored to Vercel.'
      : 'Key saved.';
    await patch({ openrouter }, msg);
  }

  async function syncFromVercel() {
    setSyncing(true);
    try {
      await patch({ syncFromVercel: { openrouter: true } }, 'Pulled from Vercel.');
    } finally {
      setSyncing(false);
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
            <h2 className="text-[15px] font-semibold text-text-primary">OpenRouter API key</h2>
            <p className="mt-1 text-[13px] text-text-muted">
              One key drives every model call across Cortex. Saving here writes to the DB
              <em> and</em> pushes the same value up to Vercel&apos;s{' '}
              <code className="font-mono text-text-secondary">OPENROUTER_API_KEY</code>{' '}
              env var — so the two sources never drift.
            </p>
          </div>
          <a
            href="https://openrouter.ai/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-text-muted transition-colors hover:text-accent-text"
          >
            <ExternalLink size={12} /> Manage keys on OpenRouter
          </a>
        </div>

        <VercelMirrorPill
          mirror={mirror}
          dbConfigured={current.configured}
          onSync={syncFromVercel}
          syncing={syncing}
        />

        <div className="rounded-lg border border-nativz-border/70 bg-surface-hover/25 p-4">
          {current.configured && (
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-mono text-[12px] text-text-secondary">
                Saved in DB: {current.masked ?? '••••'}
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
            placeholder={current.configured ? 'Replace with a new key…' : 'sk-or-v1-…'}
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

function VercelMirrorPill({
  mirror,
  dbConfigured,
  onSync,
  syncing,
}: {
  mirror: VercelMirror;
  dbConfigured: boolean;
  onSync: () => void;
  syncing: boolean;
}) {
  if (!mirror.available) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-nativz-border/60 bg-background/40 px-3 py-2 text-[12px] text-text-muted">
        <CloudOff size={13} />
        <span>
          Vercel sync not configured — add <code className="font-mono">VERCEL_TOKEN</code> and{' '}
          <code className="font-mono">VERCEL_PROJECT_ID</code> to enable two-way sync.
        </span>
      </div>
    );
  }

  if (!mirror.configured) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px]"
        style={{
          borderColor: 'color-mix(in srgb, var(--status-warning) 35%, transparent)',
          backgroundColor: 'color-mix(in srgb, var(--status-warning) 10%, transparent)',
          color: 'var(--text-primary)',
        }}
      >
        <Cloud size={13} style={{ color: 'var(--status-warning)' }} />
        <span>
          Vercel&apos;s <code className="font-mono">{mirror.envKey}</code> is empty. Saving a key
          here will create it.
        </span>
      </div>
    );
  }

  const differs = mirror.differsFromDb && dbConfigured;
  const matches = !differs && dbConfigured;
  const envOnly = !dbConfigured && mirror.configured;

  if (matches) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px]"
        style={{
          borderColor: 'color-mix(in srgb, var(--status-success) 35%, transparent)',
          backgroundColor: 'color-mix(in srgb, var(--status-success) 10%, transparent)',
          color: 'var(--text-primary)',
        }}
      >
        <Cloud size={13} style={{ color: 'var(--status-success)' }} />
        <span>
          In sync with Vercel{' '}
          <code className="font-mono">{mirror.envKey}</code>
          {mirror.targets && mirror.targets.length > 0 ? ` · ${mirror.targets.join(' · ')}` : ''}
          {mirror.updatedAt ? ` · updated ${relativeTime(mirror.updatedAt)}` : ''}
        </span>
      </div>
    );
  }

  // Either the two values differ, or DB is empty while Vercel has a value —
  // in both cases the user probably wants to pull from Vercel.
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[12px]"
      style={{
        borderColor: 'color-mix(in srgb, var(--status-warning) 40%, transparent)',
        backgroundColor: 'color-mix(in srgb, var(--status-warning) 12%, transparent)',
        color: 'var(--text-primary)',
      }}
    >
      <div className="flex items-start gap-2">
        <Cloud size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--status-warning)' }} />
        <span>
          {envOnly ? (
            <>
              Vercel has a value for <code className="font-mono">{mirror.envKey}</code>
              {' '}({mirror.masked ?? '••••'}) but the DB is empty.
            </>
          ) : (
            <>
              Vercel&apos;s <code className="font-mono">{mirror.envKey}</code>{' '}
              ({mirror.masked ?? '••••'}) differs from the DB key.
              {mirror.updatedAt ? ` Vercel updated ${relativeTime(mirror.updatedAt)}.` : ''}
            </>
          )}
        </span>
      </div>
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-50"
        style={{
          borderColor: 'color-mix(in srgb, var(--status-warning) 55%, transparent)',
          backgroundColor: 'var(--status-warning)',
          /* Status warning is a light amber in both brand modes — dark ink
             is the only foreground that passes contrast on it. */
          color: '#1a1400',
        }}
      >
        {syncing ? <Loader2 size={12} className="animate-spin" /> : <ArrowDownFromLine size={12} />}
        Use Vercel value
      </button>
    </div>
  );
}
