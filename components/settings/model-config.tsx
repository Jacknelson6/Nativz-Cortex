'use client';

import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  X,
  ChevronUp,
  ChevronDown,
  Search,
  Image,
  Ear,
  Video,
  Type,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenRouterModel {
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

export function ModelSelector({
  models,
  value,
  onSelect,
  placeholder,
  excludeIds,
  /** When set (e.g. `anthropic`), only models whose OpenRouter id starts with `{prefix}/` */
  providerPrefixFilter,
}: {
  models: OpenRouterModel[];
  value: string;
  onSelect: (id: string) => void;
  placeholder: string;
  excludeIds?: string[];
  providerPrefixFilter?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [hoveredModel, setHoveredModel] = useState<OpenRouterModel | null>(null);
  const [sortField, setSortField] = useState<SortField>('price');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [freeOnly, setFreeOnly] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [panelBox, setPanelBox] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  /** Portal + fixed position avoids clipping from overflow-hidden / details / cards. */
  useLayoutEffect(() => {
    if (!open) {
      setPanelBox(null);
      return;
    }
    function measure() {
      const node = triggerRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      setPanelBox({
        top: r.bottom + 4,
        left: r.left,
        width: Math.max(640, r.width),
      });
    }
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open]);

  // Close on outside click (trigger + portaled panel)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
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
      if (
        providerPrefixFilter &&
        providerPrefixFilter !== 'all' &&
        !m.id.startsWith(`${providerPrefixFilter}/`)
      ) {
        return false;
      }
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
  }, [models, search, excludeIds, sortField, sortDir, freeOnly, providerPrefixFilter]);

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

  const dropdownPanel =
    open &&
    panelBox &&
    createPortal(
      <div
        ref={panelRef}
        role="listbox"
        className="rounded-xl border border-nativz-border bg-surface shadow-elevated overflow-hidden"
        style={{
          position: 'fixed',
          top: panelBox.top,
          left: Math.max(8, Math.min(panelBox.left, typeof window !== 'undefined' ? window.innerWidth - panelBox.width - 8 : panelBox.left)),
          width: panelBox.width,
          zIndex: 200,
          maxWidth: typeof window !== 'undefined' ? window.innerWidth - 16 : undefined,
        }}
      >
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
      </div>,
      document.body,
    );

  return (
    <div className="w-full min-w-0">
      <div ref={triggerRef} className="w-full">
        <button
          type="button"
          onClick={() => {
            setOpen(!open);
            if (!open) setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className="flex w-full items-center gap-2 rounded-lg border border-nativz-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-accent/30 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/25"
        >
          {value ? (
            <span className="flex-1 truncate">
              <span className="font-mono text-accent-text">{value}</span>
              {selectedModel && selectedModel.name !== value && (
                <span className="ml-2 text-xs text-text-muted">{selectedModel.name}</span>
              )}
            </span>
          ) : (
            <span className="flex-1 text-text-muted">{placeholder}</span>
          )}
          <Search size={14} className="shrink-0 text-text-muted" />
        </button>
      </div>
      {dropdownPanel}
    </div>
  );
}
