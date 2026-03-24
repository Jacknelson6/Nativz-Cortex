'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Cpu,
  Check,
  Loader2,
  Plus,
  X,
  ChevronUp,
  ChevronDown,
  Search,
  Shield,
  Image,
  Ear,
  Video,
  Type,
  Sparkles,
} from 'lucide-react';
import { Card } from '@/components/ui/card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  inputModalities: string[];
  outputModalities: string[];
  promptPrice: number;
  completionPrice: number;
  isFree: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatContext(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function formatPrice(perMillion: number): string {
  if (perMillion < 0) return 'Variable';
  if (perMillion === 0) return 'Free';
  if (perMillion < 0.01) return `$${perMillion.toFixed(4)}`;
  if (perMillion < 1) return `$${perMillion.toFixed(3)}`;
  return `$${perMillion.toFixed(2)}`;
}

function modalityIcon(mod: string) {
  switch (mod) {
    case 'image': return <Image size={12} />;
    case 'audio': return <Ear size={12} />;
    case 'video': return <Video size={12} />;
    default: return <Type size={12} />;
  }
}

// ---------------------------------------------------------------------------
// Model selector dropdown
// ---------------------------------------------------------------------------

type SortField = 'name' | 'context' | 'price' | 'multimodal';
type SortDir = 'asc' | 'desc';

const MODALITIES = ['text', 'image', 'audio', 'video'] as const;

function ModalityCheck({ has }: { has: boolean }) {
  return has ? (
    <Check size={13} className="text-emerald-400 mx-auto" />
  ) : (
    <span className="block w-3 h-px bg-nativz-border mx-auto" />
  );
}

function ModelSelector({
  models,
  value,
  onSelect,
  placeholder,
  excludeIds,
}: {
  models: OpenRouterModel[];
  value: string;
  onSelect: (id: string) => void;
  placeholder: string;
  excludeIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [hoveredModel, setHoveredModel] = useState<OpenRouterModel | null>(null);
  const [sortField, setSortField] = useState<SortField>('price');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [freeOnly, setFreeOnly] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'price' ? 'asc' : 'asc');
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = models.filter((m) => {
      if (excludeIds?.includes(m.id)) return false;
      if (freeOnly && !m.isFree) return false;
      if (!q) return true;
      return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    });

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'context':
          cmp = a.contextLength - b.contextLength;
          break;
        case 'multimodal':
          cmp = a.inputModalities.length - b.inputModalities.length;
          break;
        case 'price': {
          // Normalize: free=0, variable=Infinity (sort to end), paid=actual price
          const priceA = a.isFree ? 0 : a.promptPrice < 0 ? Infinity : a.promptPrice + a.completionPrice;
          const priceB = b.isFree ? 0 : b.promptPrice < 0 ? Infinity : b.promptPrice + b.completionPrice;
          cmp = priceA - priceB;
          break;
        }
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [models, search, excludeIds, sortField, sortDir, freeOnly]);

  const selectedModel = models.find((m) => m.id === value);

  function handleHoverEnter(m: OpenRouterModel) {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    tooltipTimeoutRef.current = setTimeout(() => setHoveredModel(m), 300);
  }

  function handleHoverLeave() {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    tooltipTimeoutRef.current = null;
    setHoveredModel(null);
  }

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="inline" />
      : <ChevronDown size={12} className="inline" />;
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open) setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="w-full flex items-center gap-2 rounded-lg border border-nativz-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-accent/30 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/25"
      >
        {value ? (
          <span className="flex-1 truncate">
            <span className="font-mono text-accent-text">{value}</span>
            {selectedModel && selectedModel.name !== value && (
              <span className="text-text-muted ml-2 text-xs">{selectedModel.name}</span>
            )}
          </span>
        ) : (
          <span className="flex-1 text-text-muted">{placeholder}</span>
        )}
        <Search size={14} className="text-text-muted shrink-0" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[640px] rounded-xl border border-nativz-border bg-surface shadow-elevated overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-nativz-border">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-background border border-nativz-border">
              <Search size={14} className="text-text-muted shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models..."
                className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-text-muted hover:text-text-primary">
                  <X size={14} />
                </button>
              )}
              <button
                onClick={() => setFreeOnly(!freeOnly)}
                className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-md border transition-colors ${
                  freeOnly
                    ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/30'
                    : 'text-text-muted border-nativz-border hover:text-text-primary hover:border-text-muted'
                }`}
              >
                Free
              </button>
              <span className="text-xs text-text-muted shrink-0">{filtered.length}</span>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[minmax(180px,1fr)_56px_32px_32px_32px_32px_68px_68px] gap-1 px-3 py-1.5 border-b border-nativz-border text-[11px] font-medium text-text-muted uppercase tracking-wider">
            <button onClick={() => toggleSort('name')} className="text-left hover:text-text-primary transition-colors flex items-center gap-1">
              Model {sortIcon('name')}
            </button>
            <button onClick={() => toggleSort('context')} className="text-right hover:text-text-primary transition-colors flex items-center justify-end gap-1">
              Ctx {sortIcon('context')}
            </button>
            <button onClick={() => toggleSort('multimodal')} className="text-center hover:text-text-primary transition-colors" title="Text">
              <Type size={11} className="mx-auto" />
            </button>
            <button onClick={() => toggleSort('multimodal')} className="text-center hover:text-text-primary transition-colors" title="Image">
              <Image size={11} className="mx-auto" />
            </button>
            <button onClick={() => toggleSort('multimodal')} className="text-center hover:text-text-primary transition-colors" title="Audio">
              <Ear size={11} className="mx-auto" />
            </button>
            <button onClick={() => toggleSort('multimodal')} className="text-center hover:text-text-primary transition-colors" title="Video">
              <Video size={11} className="mx-auto" />
            </button>
            <button onClick={() => toggleSort('price')} className="text-right hover:text-text-primary transition-colors flex items-center justify-end gap-1">
              In/M {sortIcon('price')}
            </button>
            <span className="text-right">Out/M</span>
          </div>

          {/* Model rows */}
          <div className="max-h-80 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-text-muted py-6 text-center">No models found</p>
            ) : (
              filtered.map((m) => (
                <div key={m.id} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(m.id);
                      setOpen(false);
                      setSearch('');
                    }}
                    onMouseEnter={() => handleHoverEnter(m)}
                    onMouseLeave={handleHoverLeave}
                    className={`w-full grid grid-cols-[minmax(180px,1fr)_56px_32px_32px_32px_32px_68px_68px] gap-1 items-center px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover ${
                      value === m.id ? 'bg-accent-surface/50' : ''
                    }`}
                  >
                    {/* Name + ID */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-text-primary font-medium truncate">{m.name}</span>
                        {value === m.id && <Check size={12} className="text-accent-text shrink-0" />}
                      </div>
                      <p className="text-xs text-text-muted font-mono truncate">{m.id}</p>
                    </div>

                    {/* Context */}
                    <span className="text-right text-xs text-text-secondary tabular-nums">
                      {formatContext(m.contextLength)}
                    </span>

                    {/* Modality checks */}
                    {MODALITIES.map((mod) => (
                      <ModalityCheck key={mod} has={m.inputModalities.includes(mod)} />
                    ))}

                    {/* Input price */}
                    <span className="text-right text-xs tabular-nums">
                      {m.isFree ? (
                        <span className="text-emerald-400 font-medium">Free</span>
                      ) : m.promptPrice < 0 ? (
                        <span className="text-text-muted italic">Varies</span>
                      ) : (
                        <span className="text-text-secondary">{formatPrice(m.promptPrice)}</span>
                      )}
                    </span>

                    {/* Output price */}
                    <span className="text-right text-xs tabular-nums">
                      {m.isFree ? (
                        <span className="text-emerald-400 font-medium">Free</span>
                      ) : m.completionPrice < 0 ? (
                        <span className="text-text-muted italic">Varies</span>
                      ) : (
                        <span className="text-text-secondary">{formatPrice(m.completionPrice)}</span>
                      )}
                    </span>
                  </button>

                  {/* Hover tooltip — positioned to the left */}
                  {hoveredModel?.id === m.id && (
                    <div className="absolute right-full top-0 mr-2 w-72 rounded-xl border border-nativz-border bg-surface p-4 shadow-elevated z-[60] pointer-events-none">
                      <h4 className="text-sm font-semibold text-text-primary mb-1">{m.name}</h4>
                      <p className="text-xs text-text-muted mb-3 line-clamp-4">
                        {m.description || 'No description available.'}
                      </p>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-text-muted">Context window</span>
                          <span className="text-text-primary font-medium">{formatContext(m.contextLength)} tokens</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Input pricing</span>
                          <span className="text-text-primary font-medium">{formatPrice(m.promptPrice)}/M tokens</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Output pricing</span>
                          <span className="text-text-primary font-medium">{formatPrice(m.completionPrice)}/M tokens</span>
                        </div>
                        <div className="flex justify-between items-start">
                          <span className="text-text-muted">Accepts</span>
                          <div className="flex items-center gap-1 flex-wrap justify-end">
                            {m.inputModalities.map((mod) => (
                              <span key={mod} className="flex items-center gap-0.5 bg-surface-hover px-1.5 py-0.5 rounded text-text-secondary">
                                {modalityIcon(mod)} {mod}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex justify-between items-start">
                          <span className="text-text-muted">Outputs</span>
                          <div className="flex items-center gap-1 flex-wrap justify-end">
                            {m.outputModalities.map((mod) => (
                              <span key={mod} className="flex items-center gap-0.5 bg-surface-hover px-1.5 py-0.5 rounded text-text-secondary">
                                {modalityIcon(mod)} {mod}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ModelConfig() {
  const [currentModel, setCurrentModel] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [fallbackModels, setFallbackModels] = useState<string[]>([]);
  const [savedFallbacks, setSavedFallbacks] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OpenRouter model catalog
  const [allModels, setAllModels] = useState<OpenRouterModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);

  // Fetch settings
  useEffect(() => {
    async function fetchModel() {
      try {
        const res = await fetch('/api/settings/ai-model');
        if (!res.ok) throw new Error('Failed to fetch model');
        const data = await res.json();
        setCurrentModel(data.model);
        setInputValue(data.model);
        setFallbackModels(data.fallbackModels ?? []);
        setSavedFallbacks(data.fallbackModels ?? []);
        setUpdatedAt(data.updatedAt);
      } catch {
        setError('Failed to load model settings');
      } finally {
        setLoading(false);
      }
    }
    fetchModel();
  }, []);

  // Fetch OpenRouter models catalog
  useEffect(() => {
    async function fetchModels() {
      try {
        const res = await fetch('/api/settings/openrouter-models');
        if (!res.ok) throw new Error('Failed to fetch models');
        const data = await res.json();
        setAllModels(data.models ?? []);
      } catch {
        // Non-critical — selector will just be empty
        console.warn('Failed to load OpenRouter models catalog');
      } finally {
        setModelsLoading(false);
      }
    }
    fetchModels();
  }, []);

  const hasModelChange = inputValue.trim() !== currentModel;
  const hasFallbackChange = JSON.stringify(fallbackModels) !== JSON.stringify(savedFallbacks);
  const hasChanges = hasModelChange || hasFallbackChange;

  async function handleSave() {
    if (!hasChanges || !inputValue.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const body: Record<string, unknown> = {};
      if (hasModelChange) body.model = inputValue.trim();
      if (hasFallbackChange) body.fallbackModels = fallbackModels;

      const res = await fetch('/api/settings/ai-model', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      const data = await res.json();
      setCurrentModel(data.model);
      setInputValue(data.model);
      setFallbackModels(data.fallbackModels ?? []);
      setSavedFallbacks(data.fallbackModels ?? []);
      setUpdatedAt(data.updatedAt);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save model');
    } finally {
      setSaving(false);
    }
  }

  function addFallback(modelId: string) {
    if (fallbackModels.includes(modelId) || fallbackModels.length >= 5) return;
    setFallbackModels([...fallbackModels, modelId]);
  }

  function removeFallback(index: number) {
    setFallbackModels(fallbackModels.filter((_, i) => i !== index));
  }

  function moveFallback(from: number, direction: -1 | 1) {
    const to = from + direction;
    if (to < 0 || to >= fallbackModels.length) return;
    const updated = [...fallbackModels];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    setFallbackModels(updated);
  }

  if (loading) {
    return (
      <Card>
        <div className="flex items-center gap-3 animate-pulse">
          <div className="h-10 w-10 rounded-xl bg-surface-hover" />
          <div className="space-y-2 flex-1">
            <div className="h-4 w-32 rounded bg-surface-hover" />
            <div className="h-3 w-48 rounded bg-surface-hover" />
          </div>
        </div>
      </Card>
    );
  }

  const excludeFromFallback = [inputValue, ...fallbackModels];

  return (
    <Card>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-surface">
            <Cpu size={20} className="text-accent-text" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Active model</h2>
            <p className="text-xs text-text-muted">
              Platform-wide OpenRouter model for all AI features
            </p>
          </div>
        </div>

        {/* Current model display */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-hover border border-nativz-border">
          <span className="text-xs text-text-muted">Currently active:</span>
          <code className="text-sm font-mono text-accent-text">{currentModel}</code>
          {updatedAt && (
            <span className="ml-auto text-xs text-text-muted">
              Updated{' '}
              {new Date(updatedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>

        {/* Model selector */}
        {modelsLoading ? (
          <div className="h-10 rounded-lg bg-surface-hover animate-pulse" />
        ) : (
          <ModelSelector
            models={allModels}
            value={inputValue}
            onSelect={setInputValue}
            placeholder="Search and select a model..."
          />
        )}

        {/* ── Fallback models ───────────────────────────────── */}
        <div className="border-t border-nativz-border pt-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={16} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-text-primary">Fallback chain</h3>
            <span className="text-xs text-text-muted ml-1">
              Tried in order if the primary fails
            </span>
          </div>

          {/* Fallback list */}
          {fallbackModels.length > 0 ? (
            <div className="space-y-1.5 mb-3">
              {fallbackModels.map((modelId, i) => {
                const model = allModels.find((m) => m.id === modelId);
                return (
                  <div
                    key={`${modelId}-${i}`}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-hover border border-nativz-border group"
                  >
                    <span className="text-xs text-text-muted font-mono w-5 shrink-0 text-center">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-text-primary font-medium truncate block">
                        {model?.name ?? modelId}
                      </span>
                      {model && model.name !== modelId && (
                        <span className="text-xs text-text-muted font-mono">{modelId}</span>
                      )}
                    </div>
                    {model && (
                      <span className="text-xs text-text-muted shrink-0">
                        {model.isFree ? (
                          <span className="text-emerald-400">Free</span>
                        ) : (
                          `${formatPrice(model.promptPrice)}/M`
                        )}
                      </span>
                    )}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => moveFallback(i, -1)}
                        disabled={i === 0}
                        className="p-1 rounded text-text-muted hover:text-text-primary disabled:opacity-20 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={() => moveFallback(i, 1)}
                        disabled={i === fallbackModels.length - 1}
                        className="p-1 rounded text-text-muted hover:text-text-primary disabled:opacity-20 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <button
                        onClick={() => removeFallback(i)}
                        className="p-1 rounded text-text-muted hover:text-red-400 transition-colors"
                        title="Remove"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-text-muted mb-3">
              No fallback models. If the primary is unavailable, requests will fail.
            </p>
          )}

          {/* Add fallback selector */}
          {fallbackModels.length < 5 && !modelsLoading && (
            <ModelSelector
              models={allModels}
              value=""
              onSelect={(id) => addFallback(id)}
              placeholder="+ Add fallback model..."
              excludeIds={excludeFromFallback}
            />
          )}
        </div>

        {/* ── Save button + messages ───────────────────────── */}
        <div className="flex items-center gap-3 border-t border-nativz-border pt-4">
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges || !inputValue.trim()}
            className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-accent-surface text-accent-text hover:bg-accent/20"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : success ? (
              <Check size={14} />
            ) : null}
            {saving ? 'Saving...' : success ? 'Saved' : 'Save changes'}
          </button>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {success && (
            <p className="text-xs text-emerald-400">
              Settings updated. Changes take effect on the next AI request.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
