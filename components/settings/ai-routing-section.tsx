'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Check, ChevronDown, ChevronUp, ExternalLink, Loader2, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ModelSelector, type OpenRouterModel } from '@/components/settings/model-config';
import { cn } from '@/lib/utils/cn';
import { inferModelBackend, toOpenAiPrefixedModel, type ModelBackend } from '@/lib/ai/model-backend';
import { toOpenAiChatModelId } from '@/lib/ai/openai-model-id';
import {
  OPENAI_CHAT_MODEL_IDS,
  openAiChatOptionGroups,
} from '@/lib/ai/openai-chat-models';
import { DEFAULT_OPENROUTER_MODEL } from '@/lib/ai/openrouter-default-model';

function openRouterProviderId(modelId: string): string {
  const i = modelId.indexOf('/');
  return i > 0 ? modelId.slice(0, i) : modelId;
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI (via OpenRouter)',
  google: 'Google',
  'meta-llama': 'Meta Llama',
  mistralai: 'Mistral',
  cohere: 'Cohere',
  deepseek: 'DeepSeek',
  'x-ai': 'xAI',
  perplexity: 'Perplexity',
  nvidia: 'NVIDIA',
  qwen: 'Qwen',
  openrouter: 'OpenRouter',
};

function providerLabel(id: string): string {
  return PROVIDER_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ');
}

type RowState = {
  backend: ModelBackend;
  orProvider: string;
  modelId: string;
};

function BrowseModelsLink({ backend }: { backend: ModelBackend }) {
  const isOpenRouter = backend === 'openrouter';
  const href = isOpenRouter ? 'https://openrouter.ai/models' : 'https://platform.openai.com/docs/models';
  const label = isOpenRouter ? 'Browse OpenRouter' : 'Browse OpenAI models';
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-accent-text"
      title={`Open ${isOpenRouter ? 'openrouter.ai/models' : 'platform.openai.com/docs/models'} in a new tab`}
    >
      <ExternalLink size={12} />
      {label}
    </a>
  );
}

function BackendToggle({
  value,
  onChange,
}: {
  value: ModelBackend;
  onChange: (v: ModelBackend) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-nativz-border bg-background p-0.5">
      {(['openrouter', 'openai'] as const).map((b) => (
        <button
          key={b}
          type="button"
          onClick={() => onChange(b)}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
            value === b
              ? 'bg-accent-surface text-accent-text'
              : 'text-text-muted hover:text-text-secondary',
          )}
        >
          {b === 'openrouter' ? 'OpenRouter' : 'OpenAI'}
        </button>
      ))}
    </div>
  );
}

function OpenAiModelSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const native = toOpenAiChatModelId(value) || '';
  const inList = OPENAI_CHAT_MODEL_IDS.has(native);
  const [showCustom, setShowCustom] = useState(() => Boolean(native) && !inList);

  useEffect(() => {
    const n = toOpenAiChatModelId(value) || '';
    const il = OPENAI_CHAT_MODEL_IDS.has(n);
    setShowCustom(Boolean(n) && !il);
  }, [value]);

  return (
    <div className="space-y-2">
      <select
        value={native && inList && !showCustom ? native : showCustom || native ? '__custom__' : ''}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__custom__') {
            setShowCustom(true);
            onChange(toOpenAiPrefixedModel('gpt-4o-mini'));
            return;
          }
          if (!v) {
            setShowCustom(false);
            onChange('');
            return;
          }
          setShowCustom(false);
          onChange(toOpenAiPrefixedModel(v));
        }}
        className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/30"
      >
        <option value="">Pick a model…</option>
        {openAiChatOptionGroups().map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="__custom__">Custom model id…</option>
      </select>
      {showCustom && (
        <input
          type="text"
          value={native}
          onChange={(e) => {
            const t = e.target.value.trim();
            onChange(t ? toOpenAiPrefixedModel(t) : '');
          }}
          placeholder="e.g. gpt-4o-mini"
          className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/30"
        />
      )}
    </div>
  );
}

export function AiRoutingSection() {
  const [topic, setTopic] = useState<RowState>({
    backend: 'openrouter',
    orProvider: 'all',
    modelId: '',
  });
  const [agents, setAgents] = useState<RowState>({
    backend: 'openrouter',
    orProvider: 'all',
    modelId: '',
  });
  const [platform, setPlatform] = useState<RowState & { fallbacks: string[] }>({
    backend: 'openrouter',
    orProvider: 'all',
    modelId: '',
    fallbacks: [],
  });
  const [ideasModel, setIdeasModel] = useState('');
  const [savedIdeas, setSavedIdeas] = useState('');

  const [savedTopic, setSavedTopic] = useState('');
  const [savedAgents, setSavedAgents] = useState('');
  const [savedPlatform, setSavedPlatform] = useState('');
  const [savedFallbacks, setSavedFallbacks] = useState<string[]>([]);

  const [allModels, setAllModels] = useState<OpenRouterModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const providerOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const m of allModels) {
      ids.add(openRouterProviderId(m.id));
    }
    return Array.from(ids).sort((a, b) => providerLabel(a).localeCompare(providerLabel(b)));
  }, [allModels]);

  const orFilter = (p: string) => (p === 'all' ? null : p);

  const hydrateRow = useCallback((modelId: string): RowState => {
    const backend = inferModelBackend(modelId);
    return {
      backend,
      orProvider: 'all',
      modelId: modelId.trim(),
    };
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

        const planner = (ai.topicSearchPlannerModel as string) ?? '';
        const research = (ai.topicSearchResearchModel as string) ?? '';
        const merger = (ai.topicSearchMergerModel as string) ?? '';
        const topicId =
          planner && planner === research && (!merger || merger === planner) ? planner : planner || research;

        const t = hydrateRow(topicId);
        setTopic(t);
        setSavedTopic(t.modelId);

        const nerd = (cred.nerdModel as string) ?? '';
        const a = hydrateRow(nerd || DEFAULT_OPENROUTER_MODEL);
        setAgents(a);
        setSavedAgents(nerd);

        const primary = (ai.model as string) ?? '';
        const pl = hydrateRow(primary);
        setPlatform({
          ...pl,
          fallbacks: (ai.fallbackModels as string[]) ?? [],
        });
        setSavedPlatform(primary);
        setSavedFallbacks((ai.fallbackModels as string[]) ?? []);

        const ideas = (cred.ideasModel as string) ?? '';
        setIdeasModel(ideas);
        setSavedIdeas(ideas);

        setUpdatedAt((ai.updatedAt as string) ?? null);
      } catch {
        setError('Failed to load AI routing');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [hydrateRow]);

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

  const topicDirty = topic.modelId.trim() !== savedTopic.trim();
  const agentsDirty = agents.modelId.trim() !== savedAgents.trim();
  const platformDirty =
    platform.modelId.trim() !== savedPlatform.trim() ||
    JSON.stringify(platform.fallbacks) !== JSON.stringify(savedFallbacks);
  const ideasDirty = ideasModel.trim() !== savedIdeas.trim();
  const dirty = topicDirty || agentsDirty || platformDirty || ideasDirty;

  async function handleSave() {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      async function assertOk(res: Response, fallback: string) {
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error?.trim() || `${fallback} (${res.status})`);
        }
      }

      // Split PATCHes: topic search columns (migration 073) are separate from platform
      // `ai_model` / fallbacks. One combined UPDATE fails entirely if topic columns are missing.
      if (platformDirty) {
        if (!platform.modelId.trim()) throw new Error('Choose a primary model for “Everything else”');
        await assertOk(
          await fetch('/api/settings/ai-model', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: platform.modelId.trim(),
              fallbackModels: platform.fallbacks,
            }),
          }),
          'Failed to save platform model',
        );
      }

      if (agentsDirty || ideasDirty) {
        const credBody: Record<string, unknown> = {};
        if (agentsDirty) {
          if (!agents.modelId.trim()) throw new Error('Choose a model for agents');
          credBody.nerdModel = agents.modelId.trim();
        }
        if (ideasDirty) {
          credBody.ideasModel = ideasModel.trim() || null;
        }
        await assertOk(
          await fetch('/api/settings/llm-credentials', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credBody),
          }),
          'Failed to save API keys / agent models',
        );
      }

      if (topicDirty) {
        if (!topic.modelId.trim()) throw new Error('Choose a model for topic search');
        await assertOk(
          await fetch('/api/settings/ai-model', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topicSearchModel: topic.modelId.trim() }),
          }),
          'Failed to save topic search model',
        );
      }

      const aiRes = await fetch('/api/settings/ai-model');
      const credRes = await fetch('/api/settings/llm-credentials');
      const ai = await aiRes.json();
      const cred = await credRes.json();

      const planner = (ai.topicSearchPlannerModel as string) ?? '';
      const research = (ai.topicSearchResearchModel as string) ?? '';
      const merger = (ai.topicSearchMergerModel as string) ?? '';
      const topicId =
        planner && planner === research && (!merger || merger === planner) ? planner : planner || research;
      setTopic(hydrateRow(topicId));
      setSavedTopic(topicId);

      const nerd = (cred.nerdModel as string) ?? '';
      setAgents(hydrateRow(nerd || DEFAULT_OPENROUTER_MODEL));
      setSavedAgents(nerd);

      const primary = (ai.model as string) ?? '';
      setPlatform({
        ...hydrateRow(primary),
        fallbacks: (ai.fallbackModels as string[]) ?? [],
      });
      setSavedPlatform(primary);
      setSavedFallbacks((ai.fallbackModels as string[]) ?? []);

      const ideas = (cred.ideasModel as string) ?? '';
      setIdeasModel(ideas);
      setSavedIdeas(ideas);
      setUpdatedAt((ai.updatedAt as string) ?? null);

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function renderModelPicker(
    row: RowState,
    setRow: (r: RowState) => void,
    placeholder: string,
  ) {
    const filterProp = orFilter(row.orProvider);
    if (row.backend === 'openai') {
      return <OpenAiModelSelect value={row.modelId} onChange={(id) => setRow({ ...row, modelId: id })} />;
    }
    if (modelsLoading) {
      return <div className="h-10 animate-pulse rounded-lg bg-surface-hover" />;
    }
    const slugInCatalog = row.modelId.trim()
      ? allModels.some((m) => m.id === row.modelId.trim())
      : null;

    return (
      <div className="space-y-2">
        <select
          aria-label="Filter OpenRouter by upstream provider"
          value={row.orProvider}
          onChange={(e) => setRow({ ...row, orProvider: e.target.value })}
          className="w-full max-w-xs rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
        >
          <option value="all">All providers</option>
          {providerOptions.map((id) => (
            <option key={id} value={id}>
              {providerLabel(id)}
            </option>
          ))}
        </select>
        <ModelSelector
          models={allModels}
          value={row.modelId}
          onSelect={(id) => setRow({ ...row, modelId: id })}
          placeholder={placeholder}
          providerPrefixFilter={filterProp}
        />
        <div className="rounded-lg border border-nativz-border/60 bg-background/40 px-3 py-2.5">
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Or paste an OpenRouter slug
          </label>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-text-muted">openrouter:</span>
            <input
              type="text"
              value={row.modelId}
              onChange={(e) => setRow({ ...row, modelId: e.target.value.trim() })}
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
            . Bypasses the dropdown — useful for newly-released models that haven't synced yet.
          </p>
        </div>
      </div>
    );
  }

  function addFallback(id: string) {
    if (!id || platform.fallbacks.includes(id) || platform.fallbacks.length >= 5) return;
    if (id === platform.modelId) return;
    setPlatform((p) => ({ ...p, fallbacks: [...p.fallbacks, id] }));
  }

  function removeFallback(i: number) {
    setPlatform((p) => ({ ...p, fallbacks: p.fallbacks.filter((_, j) => j !== i) }));
  }

  function moveFallback(from: number, dir: -1 | 1) {
    const to = from + dir;
    if (to < 0 || to >= platform.fallbacks.length) return;
    const next = [...platform.fallbacks];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setPlatform((p) => ({ ...p, fallbacks: next }));
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

  const excludeFb = [platform.modelId, ...platform.fallbacks];

  return (
    <Card className="p-0">
      <div className="border-b border-nativz-border/60 px-5 py-4">
        <h2 className="text-sm font-semibold text-text-primary">Models</h2>
        <p className="mt-0.5 text-xs text-text-muted">
          OpenRouter or OpenAI on each row. Add API keys below if you don’t rely on env vars only.
        </p>
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

      <div className="divide-y divide-nativz-border/60 px-5">
        <section className="py-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-text-primary">Topic search</h3>
              <p className="text-xs text-text-muted">Research pipeline (planner → subtopics → merge).</p>
            </div>
            <div className="flex items-center gap-3">
              <BrowseModelsLink backend={topic.backend} />
              <BackendToggle
                value={topic.backend}
                onChange={(backend) =>
                  setTopic((r) => ({
                    ...r,
                    backend,
                    modelId: backend === r.backend ? r.modelId : '',
                  }))
                }
              />
            </div>
          </div>
          {renderModelPicker(topic, setTopic, 'Search model…')}
        </section>

        <section className="py-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-text-primary">Agents</h3>
              <p className="text-xs text-text-muted">Nerd and agent chat.</p>
            </div>
            <div className="flex items-center gap-3">
              <BrowseModelsLink backend={agents.backend} />
              <BackendToggle
                value={agents.backend}
                onChange={(backend) =>
                  setAgents((r) => ({
                    ...r,
                    backend,
                    modelId: backend === r.backend ? r.modelId : '',
                  }))
                }
              />
            </div>
          </div>
          {renderModelPicker(agents, setAgents, 'Agent model…')}
        </section>

        <section className="py-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-text-primary">Default</h3>
              <p className="text-xs text-text-muted">Everything that isn’t topic search or agents.</p>
            </div>
            <div className="flex items-center gap-3">
              <BrowseModelsLink backend={platform.backend} />
              <BackendToggle
                value={platform.backend}
                onChange={(backend) =>
                  setPlatform((r) => ({
                    ...r,
                    backend,
                    modelId: backend === r.backend ? r.modelId : '',
                  }))
                }
              />
            </div>
          </div>
          {renderModelPicker(
            { backend: platform.backend, orProvider: platform.orProvider, modelId: platform.modelId },
            (r) => setPlatform((p) => ({ ...p, ...r })),
            'Primary model…',
          )}

          <details className="mt-4 rounded-lg border border-nativz-border/70 bg-surface-hover/20 [&_summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer list-none px-3 py-2.5 text-sm text-text-secondary transition-colors hover:text-text-primary">
              <span className="text-text-muted">Optional:</span> fallbacks and content ideas
            </summary>
            <div className="space-y-5 border-t border-nativz-border/50 px-3 pb-4 pt-3">
              {platform.backend === 'openrouter' && !modelsLoading && (
                <div>
                  <p className="mb-2 text-xs text-text-muted">
                    Fallbacks (OpenRouter only) — tried in order if the primary errors.
                  </p>
                  {platform.fallbacks.length > 0 ? (
                    <div className="mb-3 space-y-1.5">
                      {platform.fallbacks.map((modelId, i) => {
                        const m = allModels.find((x) => x.id === modelId);
                        return (
                          <div
                            key={`${modelId}-${i}`}
                            className="group flex items-center gap-2 rounded-lg border border-nativz-border bg-background px-3 py-2"
                          >
                            <span className="w-5 shrink-0 text-center font-mono text-xs text-text-muted">
                              {i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-text-primary">{m?.name ?? modelId}</span>
                            </div>
                            <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                type="button"
                                className="rounded p-1 text-text-muted hover:text-text-primary disabled:opacity-30"
                                disabled={i === 0}
                                onClick={() => moveFallback(i, -1)}
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                type="button"
                                className="rounded p-1 text-text-muted hover:text-text-primary disabled:opacity-30"
                                disabled={i === platform.fallbacks.length - 1}
                                onClick={() => moveFallback(i, 1)}
                              >
                                <ChevronDown size={14} />
                              </button>
                              <button
                                type="button"
                                className="rounded p-1 text-text-muted hover:text-red-400"
                                onClick={() => removeFallback(i)}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mb-3 text-xs text-text-muted">No fallbacks configured.</p>
                  )}
                  {platform.fallbacks.length < 5 && (
                    <ModelSelector
                      models={allModels}
                      value=""
                      onSelect={addFallback}
                      placeholder="+ Add fallback…"
                      excludeIds={excludeFb}
                    />
                  )}
                </div>
              )}

              <div>
                <p className="mb-2 text-xs text-text-muted">Different model for content ideas (optional).</p>
                {modelsLoading ? (
                  <div className="h-10 animate-pulse rounded-lg bg-surface-hover" />
                ) : (
                  <ModelSelector
                    models={allModels}
                    value={ideasModel}
                    onSelect={setIdeasModel}
                    placeholder="Use default above"
                    providerPrefixFilter={
                      platform.backend === 'openrouter' ? orFilter(platform.orProvider) : null
                    }
                  />
                )}
                {ideasModel.trim() ? (
                  <button
                    type="button"
                    className="mt-2 text-xs text-text-muted hover:text-accent-text"
                    onClick={() => setIdeasModel('')}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          </details>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-nativz-border/60 bg-surface-hover/10 px-5 py-4">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !dirty}
          className="flex items-center gap-2 rounded-lg bg-accent-surface px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : success ? <Check size={14} /> : null}
          {saving ? 'Saving…' : success ? 'Saved' : 'Save models'}
        </button>
        {error && (
          <p className="max-w-xl whitespace-normal break-words text-xs text-red-400">{error}</p>
        )}
        {success && <p className="text-xs text-emerald-400">Saved.</p>}
      </div>
    </Card>
  );
}
