'use client';

import { useState, useEffect, useCallback } from 'react';
import { Check, ExternalLink, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ModelSelector, type OpenRouterModel } from '@/components/settings/model-config';

/**
 * Unified AI model picker — one OpenRouter slug fans out to every routing slot
 * (topic search, agents, platform default). Replaces the prior 3-row UI where
 * each surface had its own backend toggle + model. The DB columns still exist
 * but always hold the same value now; per-slot routing can come back later if
 * we ever need it.
 */
export function AiRoutingSection() {
  const [modelId, setModelId] = useState('');
  const [savedModelId, setSavedModelId] = useState('');
  const [allModels, setAllModels] = useState<OpenRouterModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  // Read whichever slot was last set; they should converge after the first save,
  // but legacy rows may still have divergent values from the old 3-row UI.
  const hydrateFromResponses = useCallback((ai: Record<string, unknown>, cred: Record<string, unknown>) => {
    const planner = (ai.topicSearchPlannerModel as string) ?? '';
    const research = (ai.topicSearchResearchModel as string) ?? '';
    const merger = (ai.topicSearchMergerModel as string) ?? '';
    const platform = (ai.model as string) ?? '';
    const nerd = (cred.nerdModel as string) ?? '';

    const candidate = [planner, research, merger, platform, nerd].find((v) => v && v.trim());
    const id = (candidate ?? '').trim();
    setModelId(id);
    setSavedModelId(id);
    setUpdatedAt((ai.updatedAt as string) ?? null);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [aiRes, credRes] = await Promise.all([
          fetch('/api/settings/ai-model'),
          fetch('/api/settings/llm-credentials'),
        ]);
        if (!aiRes.ok || !credRes.ok) throw new Error('Failed to load');
        const ai = await aiRes.json();
        const cred = await credRes.json();
        hydrateFromResponses(ai, cred);
      } catch {
        setError('Failed to load AI model');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [hydrateFromResponses]);

  useEffect(() => {
    async function fetchModels() {
      try {
        const res = await fetch('/api/settings/openrouter-models');
        if (!res.ok) throw new Error('Failed to fetch models');
        const data = await res.json();
        setAllModels(data.models ?? []);
      } catch {
        console.warn('OpenRouter catalog unavailable');
      } finally {
        setModelsLoading(false);
      }
    }
    fetchModels();
  }, []);

  const dirty = modelId.trim() !== savedModelId.trim();
  const slugInCatalog = modelId.trim()
    ? allModels.some((m) => m.id === modelId.trim())
    : null;

  async function handleSave() {
    if (!dirty) return;
    if (!modelId.trim()) {
      setError('Pick or paste a model');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const id = modelId.trim();
      // Fan out to every slot — platform default + topic search + nerd. Drop
      // legacy fallbacks / ideas overrides so the single picker is authoritative.
      const platformRes = await fetch('/api/settings/ai-model', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: id, topicSearchModel: id, fallbackModels: [] }),
      });
      if (!platformRes.ok) {
        const data = (await platformRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error?.trim() || `Failed to save (${platformRes.status})`);
      }
      const credRes = await fetch('/api/settings/llm-credentials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nerdModel: id, ideasModel: null }),
      });
      if (!credRes.ok) {
        const data = (await credRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error?.trim() || `Failed to save Nerd model (${credRes.status})`);
      }

      const [aiOut, credOut] = await Promise.all([
        fetch('/api/settings/ai-model').then((r) => r.json()),
        fetch('/api/settings/llm-credentials').then((r) => r.json()),
      ]);
      hydrateFromResponses(aiOut, credOut);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <div className="flex animate-pulse items-center gap-3 py-6">
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
    <Card className="p-0">
      <div className="border-b border-nativz-border/60 px-5 py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Model</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              One OpenRouter slug runs every Cortex feature — topic search, the Nerd, content ideas, everything.
            </p>
          </div>
          <a
            href="https://openrouter.ai/models"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-accent-text"
          >
            <ExternalLink size={12} /> Browse OpenRouter
          </a>
        </div>
        {updatedAt ? (
          <p className="mt-1.5 text-xs text-text-muted">
            Last saved{' '}
            {new Date(updatedAt).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        ) : null}
      </div>

      <div className="space-y-4 px-5 py-5">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Pick from the OpenRouter catalog
          </label>
          {modelsLoading ? (
            <div className="h-10 animate-pulse rounded-lg bg-surface-hover" />
          ) : (
            <ModelSelector
              models={allModels}
              value={modelId}
              onSelect={setModelId}
              placeholder="Search 200+ models…"
            />
          )}
        </div>

        <div className="rounded-lg border border-nativz-border/60 bg-background/40 px-3 py-2.5">
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Or paste an OpenRouter slug
          </label>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-text-muted">openrouter:</span>
            <input
              type="text"
              value={modelId}
              onChange={(e) => setModelId(e.target.value.trim())}
              placeholder="e.g. openai/gpt-5.4-mini  ·  anthropic/claude-opus-4-7"
              spellCheck={false}
              className="flex-1 min-w-0 rounded-md border border-nativz-border bg-background px-2.5 py-1.5 font-mono text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50"
            />
            {slugInCatalog === true && (
              <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                <Check size={12} /> in catalog
              </span>
            )}
            {slugInCatalog === false && (
              <span
                className="shrink-0 text-[11px] font-medium text-amber-400"
                title="Not in cached OpenRouter catalog. Will be sent to OpenRouter anyway — request will fail if rejected."
              >
                not in catalog
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-text-muted/80 leading-relaxed">
            Copy any model id straight from{' '}
            <a
              href="https://openrouter.ai/models"
              target="_blank"
              rel="noreferrer"
              className="text-text-secondary underline decoration-dotted underline-offset-2 hover:text-accent-text"
            >
              openrouter.ai/models
            </a>
            . Useful for newly-released models that haven&apos;t synced yet.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-nativz-border/60 bg-surface-hover/10 px-5 py-4">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !dirty}
          className="flex items-center gap-2 rounded-lg bg-accent-surface px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : success ? <Check size={14} /> : null}
          {saving ? 'Saving…' : success ? 'Saved' : 'Save model'}
        </button>
        {error && (
          <p className="max-w-xl whitespace-normal break-words text-xs text-red-400">{error}</p>
        )}
        {success && <p className="text-xs text-emerald-400">Saved.</p>}
      </div>
    </Card>
  );
}
