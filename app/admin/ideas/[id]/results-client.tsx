'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Sparkles, RefreshCw, Bookmark, Check,
  Loader2, Copy, Download, ChevronDown, ArrowLeft,
  Building2, Search, AlertCircle, Zap, FileText,
  CheckSquare, Square, Phone, MousePointer, MapPin,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

// ── Types ───────────────────────────────────────────────────────────────────

interface GeneratedIdea {
  title: string;
  why_it_works: string | string[];
  content_pillar: string;
  pillar_id?: string;
  script?: string;
  scriptLoading?: boolean;
  saved?: boolean;
  selected?: boolean;
  rerolling?: boolean;
}

interface Generation {
  id: string;
  client_id: string;
  concept: string | null;
  count: number;
  reference_video_ids: string[];
  search_id: string | null;
  source_url: string | null;
  ideas: GeneratedIdea[];
  status: string;
  error_message: string | null;
  tokens_used: number;
  estimated_cost: number;
  created_at: string;
  completed_at: string | null;
  pillar_ids?: string[] | null;
  ideas_per_pillar?: number | null;
}

interface PillarInfo {
  id: string;
  name: string;
  emoji: string | null;
}

interface IdeasResultsClientProps {
  generation: Generation;
  clientName: string;
  searchQuery: string | null;
}

// ── CTA Options ─────────────────────────────────────────────────────────────

const CTA_PRESETS = [
  { value: '', label: 'Default CTA', icon: null },
  { value: 'Call us today', label: 'Call', icon: Phone },
  { value: 'Click the link in bio', label: 'Click link', icon: MousePointer },
  { value: 'Visit our website', label: 'Visit', icon: MapPin },
] as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizeReasons(why: string | string[]): string[] {
  if (Array.isArray(why)) return why;
  return why
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ── Reroll Loading Animation ────────────────────────────────────────────────

function RerollSkeleton() {
  return (
    <div className="rounded-xl border border-purple-500/20 bg-surface p-4 space-y-3">
      <div className="flex items-center gap-2">
        <motion.div
          className="h-4 w-4 rounded-full bg-purple-500/30"
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="h-4 rounded bg-purple-500/15 flex-1"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <div className="space-y-2">
        {[0.7, 0.9, 0.6].map((w, i) => (
          <motion.div
            key={i}
            className="h-3 rounded bg-purple-500/10"
            style={{ width: `${w * 100}%` }}
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Loader2 size={12} className="animate-spin text-purple-400" />
        <span className="text-xs text-purple-400/70">Generating replacement...</span>
      </div>
    </div>
  );
}

// ── Idea Card ───────────────────────────────────────────────────────────────

function IdeaResultCard({
  idea,
  index,
  onReroll,
  onSave,
  onToggleSelect,
  selectionMode,
}: {
  idea: GeneratedIdea;
  index: number;
  onReroll: (index: number) => void;
  onSave: (index: number) => void;
  onToggleSelect: (index: number) => void;
  selectionMode: boolean;
}) {
  const reasons = normalizeReasons(idea.why_it_works);

  if (idea.rerolling) {
    return <RerollSkeleton />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
      className={`group rounded-xl border bg-surface p-4 space-y-3 transition-all cursor-pointer ${
        idea.selected
          ? 'border-purple-500/40 bg-purple-500/[0.03]'
          : 'border-nativz-border hover:border-purple-500/30'
      }`}
      onClick={() => selectionMode && onToggleSelect(index)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          {selectionMode && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelect(index); }}
              className="mt-0.5 shrink-0 text-text-muted hover:text-purple-400 transition-colors"
            >
              {idea.selected ? (
                <CheckSquare size={16} className="text-purple-400" />
              ) : (
                <Square size={16} />
              )}
            </button>
          )}
          <h3 className="text-sm font-semibold text-text-primary leading-snug">{idea.title}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onReroll(index); }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all cursor-pointer"
            title="Re-roll this idea"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onSave(index); }}
            disabled={idea.saved}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all cursor-pointer ${
              idea.saved
                ? 'text-emerald-400 bg-emerald-400/10'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
            }`}
            title={idea.saved ? 'Saved' : 'Save to library'}
          >
            {idea.saved ? <Check size={13} /> : <Bookmark size={13} />}
          </button>
        </div>
      </div>

      {/* Bullet-style reasons */}
      <ul className="space-y-1.5">
        {reasons.map((reason, i) => (
          <li key={i} className="flex items-start gap-2">
            <Zap size={10} className="mt-1 text-purple-400 shrink-0" />
            <span className="text-xs text-text-secondary leading-relaxed">{reason}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2">
        <span className="text-[11px] text-text-muted">{idea.content_pillar}</span>
      </div>

      {/* Script display */}
      {idea.script && (
        <div className="pt-2 border-t border-nativz-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Script</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(idea.script!);
                toast.success('Script copied');
              }}
              className="text-[10px] text-purple-400 hover:text-purple-300 cursor-pointer"
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">{idea.script}</p>
        </div>
      )}
      {idea.scriptLoading && (
        <div className="flex items-center gap-2 pt-2 border-t border-nativz-border">
          <Loader2 size={12} className="animate-spin text-purple-400" />
          <span className="text-xs text-text-muted">Writing script...</span>
        </div>
      )}
    </motion.div>
  );
}

// ── Results Client ──────────────────────────────────────────────────────────

export function IdeasResultsClient({ generation: initialGeneration, clientName, searchQuery }: IdeasResultsClientProps) {
  const [generation, setGeneration] = useState(initialGeneration);
  const [ideas, setIdeas] = useState<GeneratedIdea[]>(
    (initialGeneration.ideas ?? []).map((i: GeneratedIdea) => ({ ...i, saved: false, selected: false })),
  );
  const selectionMode = true; // Always show checkboxes
  const [ctaType, setCtaType] = useState('');
  const [customCta, setCustomCta] = useState('');
  const [showCtaDropdown, setShowCtaDropdown] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [downloadOptions, setDownloadOptions] = useState({
    titles: true,
    whyItWorks: true,
  });

  const [pillars, setPillars] = useState<PillarInfo[]>([]);
  const completedRefIds = (generation.reference_video_ids ?? []) as string[];
  const selectedCount = ideas.filter((i) => i.selected).length;
  const effectiveCta = ctaType === 'custom' ? customCta : ctaType;
  const hasPillars = (generation.pillar_ids?.length ?? 0) > 0;

  // ── Fetch pillar info when pillar-based generation ──
  useEffect(() => {
    if (!hasPillars || !generation.client_id) return;
    fetch(`/api/clients/${generation.client_id}/pillars`)
      .then((r) => r.json())
      .then((data) => {
        const pillarMap = (data.pillars ?? []) as PillarInfo[];
        // Filter to only pillars used in this generation
        const usedIds = new Set(generation.pillar_ids ?? []);
        setPillars(pillarMap.filter((p) => usedIds.has(p.id)));
      })
      .catch(() => {});
  }, [hasPillars, generation.client_id, generation.pillar_ids]);

  // ── Poll for completion when processing ──
  useEffect(() => {
    if (generation.status !== 'processing') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/ideas/${generation.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'completed' && data.ideas) {
          setGeneration((prev) => ({ ...prev, ...data }));
          setIdeas(data.ideas.map((i: GeneratedIdea) => ({ ...i, saved: false, selected: false })));
          clearInterval(interval);
        } else if (data.status === 'failed') {
          setGeneration((prev) => ({ ...prev, ...data }));
          clearInterval(interval);
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [generation.id, generation.status]);

  // ── Failed state ──
  if (generation.status === 'failed') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20 mb-4">
          <AlertCircle size={24} className="text-red-400" />
        </div>
        <p className="text-sm font-medium text-text-secondary">Generation failed</p>
        <p className="text-xs text-text-muted mt-1 max-w-md">
          {generation.error_message ?? 'An unexpected error occurred. Please try again.'}
        </p>
        <Link
          href="/admin/search/new"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300"
        >
          <ArrowLeft size={14} />
          Back to research
        </Link>
      </div>
    );
  }

  // ── Processing state ──
  if (generation.status === 'processing') {
    const returnHref = generation.search_id
      ? `/admin/search/${generation.search_id}`
      : '/admin/search/new';

    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <motion.div
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/10 border border-purple-500/20 mb-4"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Sparkles size={28} className="text-purple-400" />
        </motion.div>
        <p className="text-sm font-medium text-text-secondary">Generating ideas...</p>
        <p className="text-xs text-text-muted mt-1">This usually takes 10-30 seconds</p>
        <Link
          href={returnHref}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 transition-colors"
        >
          <ArrowLeft size={14} />
          Return back to research
        </Link>
        <div className="mt-6 grid grid-cols-2 gap-3 w-full max-w-lg">
          {Array.from({ length: 4 }).map((_, i) => (
            <motion.div
              key={i}
              className="rounded-xl border border-purple-500/10 bg-surface p-4 space-y-2"
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
            >
              <div className="h-4 rounded bg-purple-500/10 w-3/4" />
              <div className="h-3 rounded bg-purple-500/5 w-full" />
              <div className="h-3 rounded bg-purple-500/5 w-2/3" />
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  // ── Toggle selection ──
  const toggleSelect = (index: number) => {
    setIdeas((prev) => prev.map((idea, i) => (i === index ? { ...idea, selected: !idea.selected } : idea)));
  };

  const selectAll = () => {
    setIdeas((prev) => prev.map((idea) => ({ ...idea, selected: true })));
  };

  const deselectAll = () => {
    setIdeas((prev) => prev.map((idea) => ({ ...idea, selected: false })));
  };

  // ── Generate scripts for selected ──
  const handleGenerateScripts = async () => {
    const selectedIndices = ideas.map((idea, i) => idea.selected ? i : -1).filter((i) => i >= 0);
    if (selectedIndices.length === 0) return;

    setIdeas((prev) => prev.map((idea, i) =>
      selectedIndices.includes(i) ? { ...idea, scriptLoading: true } : idea
    ));

    const batchSize = 3;
    for (let b = 0; b < selectedIndices.length; b += batchSize) {
      const batch = selectedIndices.slice(b, b + batchSize);
      await Promise.allSettled(
        batch.map(async (index) => {
          try {
            const idea = ideas[index];
            const res = await fetch('/api/ideas/generate-script', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                client_id: generation.client_id,
                title: idea.title,
                why_it_works: idea.why_it_works,
                content_pillar: idea.content_pillar,
                reference_video_ids: completedRefIds.length > 0 ? completedRefIds : undefined,
                cta: effectiveCta || undefined,
              }),
            });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            setIdeas((prev) =>
              prev.map((i, idx) => (idx === index ? { ...i, script: data.script, scriptLoading: false } : i)),
            );
          } catch {
            setIdeas((prev) => prev.map((i, idx) => (idx === index ? { ...i, scriptLoading: false } : i)));
          }
        }),
      );
    }
    toast.success('Scripts generated');
  };

  // ── Re-roll ──
  const handleReroll = async (index: number) => {
    const old = ideas[index];
    if (!old || old.rerolling) return;

    if (generation.client_id) {
      fetch('/api/ideas/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: generation.client_id,
          title: old.title,
          description: Array.isArray(old.why_it_works) ? old.why_it_works.join('. ') : old.why_it_works,
          content_pillar: old.content_pillar,
        }),
      }).catch(() => {});
    }

    setIdeas((prev) => prev.map((idea, i) => (i === index ? { ...idea, rerolling: true } : idea)));

    try {
      const body: Record<string, unknown> = {
        concept: generation.concept ?? undefined,
        count: 1,
      };
      if (generation.client_id) {
        body.client_id = generation.client_id;
        if (completedRefIds.length > 0) body.reference_video_ids = completedRefIds;
        if (generation.search_id) body.search_id = generation.search_id;
      } else if (generation.source_url) {
        body.url = generation.source_url;
      }

      const res = await fetch('/api/ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Failed');
      const data = await res.json();

      const pollForResult = async (genId: string, attempts = 0): Promise<GeneratedIdea | null> => {
        if (attempts > 20) return null;
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const pollRes = await fetch(`/api/ideas/${genId}`);
          if (!pollRes.ok) return null;
          const pollData = await pollRes.json();
          if (pollData.status === 'completed' && pollData.ideas?.[0]) return pollData.ideas[0];
          if (pollData.status === 'failed') return null;
          return pollForResult(genId, attempts + 1);
        } catch {
          return null;
        }
      };

      const newIdea = await pollForResult(data.id);
      if (newIdea) {
        setIdeas((prev) => prev.map((idea, i) => (i === index ? { ...newIdea, saved: false, selected: false } : idea)));
      } else {
        toast.error('Failed to generate replacement');
        setIdeas((prev) => prev.map((idea, i) => (i === index ? { ...old, rerolling: false } : idea)));
      }
    } catch {
      toast.error('Failed to re-roll idea');
      setIdeas((prev) => prev.map((idea, i) => (i === index ? { ...old, rerolling: false } : idea)));
    }
  };

  // ── Save ──
  const handleSave = async (index: number) => {
    const idea = ideas[index];
    if (!idea || idea.saved || !generation.client_id) return;

    const reasons = normalizeReasons(idea.why_it_works);

    try {
      const content = reasons.map((r) => `• ${r}`).join('\n') + (idea.script ? `\n\n---\n\nScript:\n${idea.script}` : '');
      const res = await fetch(`/api/clients/${generation.client_id}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'idea',
          title: idea.title,
          content,
          metadata: { content_pillar: idea.content_pillar, source: 'ideas_hub', generation_id: generation.id },
          source: 'generated',
        }),
      });
      if (res.ok) {
        setIdeas((prev) => prev.map((i, idx) => (idx === index ? { ...i, saved: true } : i)));
        toast.success('Saved to library');
      }
    } catch {
      toast.error('Failed to save');
    }
  };

  // ── Save all ──
  const handleSaveAll = async () => {
    const unsaved = ideas.filter((i) => !i.saved);
    for (let idx = 0; idx < ideas.length; idx++) {
      if (!ideas[idx].saved) await handleSave(idx);
    }
    toast.success(`${unsaved.length} ideas saved to library`);
  };

  // ── Copy selected/all ──
  const handleCopySelected = async () => {
    const toCopy = selectionMode ? ideas.filter((i) => i.selected) : ideas;
    const text = toCopy.map((i) => {
      const reasons = normalizeReasons(i.why_it_works);
      let out = `${i.title}\n${reasons.map((r) => `  • ${r}`).join('\n')}\n  Pillar: ${i.content_pillar}`;
      if (i.script) out += `\n\n  Script:\n  ${i.script.split('\n').join('\n  ')}`;
      return out;
    }).join('\n\n---\n\n');
    await navigator.clipboard.writeText(text);
    toast.success(`${toCopy.length} idea${toCopy.length !== 1 ? 's' : ''} copied`);
  };

  // ── Download ──
  const handleDownload = () => {
    const toCopy = selectionMode ? ideas.filter((i) => i.selected) : ideas;
    const lines: string[] = [];
    for (const idea of toCopy) {
      if (downloadOptions.titles) lines.push(idea.title);
      if (downloadOptions.whyItWorks) {
        const reasons = normalizeReasons(idea.why_it_works);
        lines.push('');
        reasons.forEach((r) => lines.push(`  • ${r}`));
      }
      if (idea.script) {
        lines.push('');
        lines.push('Script:');
        lines.push(idea.script);
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${clientName}-ideas.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setShowDownloadOptions(false);
  };

  return (
    <div className="space-y-5">
      {/* Breadcrumb + Header */}
      <div>
        <Link
          href="/admin/search/new"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors mb-3"
        >
          <ArrowLeft size={14} />
          Back to research
        </Link>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
            <Sparkles size={20} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-text-primary">
              {ideas.length} {generation.concept ? generation.concept : 'video'} ideas
              {searchQuery ? ` from ${searchQuery} research` : ''}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm text-text-secondary flex items-center gap-1">
                <Building2 size={12} />
                {clientName}
              </span>
              {searchQuery && (
                <Badge variant="purple" className="text-[10px] px-1.5 py-0">
                  <Search size={9} className="mr-1" />
                  From: {searchQuery}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CTA selector + selection bar */}
      <div className="rounded-xl border border-nativz-border bg-surface p-3 flex items-center gap-3 flex-wrap">
        {/* CTA Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowCtaDropdown(!showCtaDropdown)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border bg-background px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer"
          >
            CTA: {ctaType === 'custom' ? customCta || 'Custom' : ctaType || 'Default'}
            <ChevronDown size={10} />
          </button>
          {showCtaDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowCtaDropdown(false)} />
              <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-nativz-border rounded-xl shadow-xl p-2 min-w-[200px] space-y-0.5">
                {CTA_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => { setCtaType(preset.value); setShowCtaDropdown(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                      ctaType === preset.value ? 'bg-purple-500/10 text-purple-400' : 'text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    {preset.icon && <preset.icon size={12} />}
                    {preset.label}
                  </button>
                ))}
                <div className="border-t border-nativz-border pt-1 mt-1">
                  <div className="px-3 py-1">
                    <input
                      type="text"
                      value={customCta}
                      onChange={(e) => { setCustomCta(e.target.value); setCtaType('custom'); }}
                      placeholder="Custom CTA..."
                      className="w-full bg-transparent text-xs text-text-primary placeholder:text-text-muted/50 outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="h-5 w-px bg-nativz-border" />

        {/* Selection info */}
        <span className="text-xs text-text-muted">
          {selectedCount > 0
            ? `${selectedCount} selected for scripts`
            : 'Select ideas to generate scripts'}
        </span>

        {selectedCount > 0 && (
          <>
            <button
              onClick={deselectAll}
              className="text-[11px] text-text-muted hover:text-text-secondary cursor-pointer"
            >
              Deselect
            </button>
            <button
              onClick={selectAll}
              className="text-[11px] text-text-muted hover:text-text-secondary cursor-pointer"
            >
              Select all
            </button>
            <div className="h-5 w-px bg-nativz-border" />
            <button
              onClick={() => setShowScriptModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-500/20 transition-colors cursor-pointer"
            >
              <FileText size={12} />
              Generate scripts ({selectedCount})
            </button>
          </>
        )}

        {selectedCount === 0 && (
          <button
            onClick={selectAll}
            className="text-[11px] text-text-muted hover:text-text-secondary cursor-pointer"
          >
            Select all
          </button>
        )}

        <div className="flex-1" />

        {/* Batch actions */}
        <button
          onClick={handleSaveAll}
          disabled={ideas.every((i) => i.saved) || !generation.client_id}
          className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-40 cursor-pointer transition-colors"
        >
          <Bookmark size={12} />
          Save all
        </button>
        <button
          onClick={handleCopySelected}
          className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors"
        >
          <Copy size={12} />
          Copy{selectionMode && selectedCount > 0 ? ` (${selectedCount})` : ' all'}
        </button>
        <div className="relative">
          <button
            onClick={() => setShowDownloadOptions(!showDownloadOptions)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors"
          >
            <Download size={12} />
            <ChevronDown size={10} />
          </button>
          {showDownloadOptions && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDownloadOptions(false)} />
              <div className="absolute top-full right-0 mt-1 z-50 bg-surface border border-nativz-border rounded-xl shadow-xl p-3 min-w-[200px] space-y-2">
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Include in download</p>
                {([
                  ['titles', 'Titles'] as const,
                  ['whyItWorks', 'Why it works'] as const,
                ]).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={downloadOptions[key]}
                      onChange={(e) => setDownloadOptions((prev) => ({ ...prev, [key]: e.target.checked }))}
                      className="rounded border-nativz-border"
                    />
                    {label}
                  </label>
                ))}
                <button
                  onClick={handleDownload}
                  className="w-full mt-2 rounded-lg bg-purple-500 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 cursor-pointer"
                >
                  Download .txt
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Idea cards — pillar-grouped or flat */}
      {hasPillars && pillars.length > 0 ? (
        <div className="space-y-8">
          {pillars.map((pillar) => {
            const pillarIdeas = ideas
              .map((idea, originalIndex) => ({ idea, originalIndex }))
              .filter(({ idea }) => idea.pillar_id === pillar.id);

            return (
              <div key={pillar.id}>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-purple-500/20">
                  {pillar.emoji && <span className="text-base">{pillar.emoji}</span>}
                  <h3 className="text-sm font-semibold text-purple-400">{pillar.name}</h3>
                  <span className="text-[11px] text-text-muted">{pillarIdeas.length} ideas</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <AnimatePresence mode="popLayout">
                    {pillarIdeas.map(({ idea, originalIndex }) => (
                      <IdeaResultCard
                        key={`${idea.title}-${originalIndex}`}
                        idea={idea}
                        index={originalIndex}
                        onReroll={handleReroll}
                        onSave={handleSave}
                        onToggleSelect={toggleSelect}
                        selectionMode={selectionMode}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
          {/* Ideas without a pillar match (fallback) */}
          {(() => {
            const pillarIdSet = new Set(pillars.map((p) => p.id));
            const ungrouped = ideas
              .map((idea, originalIndex) => ({ idea, originalIndex }))
              .filter(({ idea }) => !idea.pillar_id || !pillarIdSet.has(idea.pillar_id));
            if (ungrouped.length === 0) return null;
            return (
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-nativz-border">
                  <h3 className="text-sm font-semibold text-text-secondary">Other ideas</h3>
                  <span className="text-[11px] text-text-muted">{ungrouped.length} ideas</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <AnimatePresence mode="popLayout">
                    {ungrouped.map(({ idea, originalIndex }) => (
                      <IdeaResultCard
                        key={`${idea.title}-${originalIndex}`}
                        idea={idea}
                        index={originalIndex}
                        onReroll={handleReroll}
                        onSave={handleSave}
                        onToggleSelect={toggleSelect}
                        selectionMode={selectionMode}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <AnimatePresence mode="popLayout">
            {ideas.map((idea, i) => (
              <IdeaResultCard
                key={`${idea.title}-${i}`}
                idea={idea}
                index={i}
                onReroll={handleReroll}
                onSave={handleSave}
                onToggleSelect={toggleSelect}
                selectionMode={selectionMode}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Script generation modal */}
      <AnimatePresence>
        {showScriptModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowScriptModal(false)}
            />
            <motion.div
              className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-surface shadow-2xl p-6"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
                  <FileText size={20} className="text-purple-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Generate scripts</h2>
                  <p className="text-sm text-text-muted">{selectedCount} idea{selectedCount !== 1 ? 's' : ''} selected</p>
                </div>
              </div>

              <div className="rounded-xl border border-nativz-border bg-background p-3 mb-4 max-h-48 overflow-y-auto space-y-1.5">
                {ideas.filter((i) => i.selected).map((idea, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                    <Check size={12} className="mt-0.5 text-purple-400 shrink-0" />
                    <span className="line-clamp-1">{idea.title}</span>
                  </div>
                ))}
              </div>

              {/* CTA selection inside modal */}
              <label className="text-xs text-text-muted mb-1.5 block">Call-to-action for scripts</label>
              <div className="flex flex-wrap gap-1.5 mb-5">
                {CTA_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => setCtaType(preset.value)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      ctaType === preset.value
                        ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                        : 'bg-white/[0.04] text-text-muted border border-transparent hover:bg-white/[0.08]'
                    }`}
                  >
                    {preset.icon && <preset.icon size={10} />}
                    {preset.label}
                  </button>
                ))}
                <input
                  type="text"
                  value={customCta}
                  onChange={(e) => { setCustomCta(e.target.value); setCtaType('custom'); }}
                  placeholder="Custom CTA..."
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors focus:outline-none ${
                    ctaType === 'custom'
                      ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30 w-36'
                      : 'bg-white/[0.04] text-text-muted border border-transparent hover:bg-white/[0.08] w-28'
                  }`}
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowScriptModal(false)}
                  className="rounded-xl px-4 py-2.5 text-sm text-text-muted hover:text-text-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowScriptModal(false);
                    handleGenerateScripts();
                  }}
                  disabled={ideas.some((i) => i.selected && i.scriptLoading)}
                  className="rounded-xl bg-purple-500/15 border border-purple-500/30 px-5 py-2.5 text-sm font-medium text-purple-400 hover:bg-purple-500/25 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  Generate {selectedCount} script{selectedCount !== 1 ? 's' : ''}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
