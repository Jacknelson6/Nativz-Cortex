'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Sparkles, RefreshCw, Bookmark, Check,
  Loader2, Copy, Download, ChevronDown, ArrowLeft,
  Building2, Search, AlertCircle, FileText,
  Pencil, HelpCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import type { GeneratedIdea, Generation, PillarInfo, IdeasResultsClientProps } from './types';
import { CTA_PRESETS, HOOK_STRATEGIES } from './types';
import { IdeaResultCard, normalizeReasons } from './idea-result-card';

// ── Results Client ──────────────────────────────────────────────────────────

export function IdeasResultsClient({
  generation: initialGeneration,
  clientName,
  agency,
  searchQuery,
  searchId = null,
  savedScripts = {},
}: IdeasResultsClientProps) {
  const [generation, setGeneration] = useState(initialGeneration);
  const [ideas, setIdeas] = useState<GeneratedIdea[]>(
    (initialGeneration.ideas ?? []).map((i: GeneratedIdea) => ({
      ...i,
      saved: false,
      selected: false,
      script: savedScripts[i.title] ?? undefined,
    })),
  );
  const selectionMode = true; // Always show checkboxes
  const [ctaType, setCtaType] = useState('');
  const [customCta, setCustomCta] = useState('');
  const [commentWord, setCommentWord] = useState('');
  const [videoLength, setVideoLength] = useState(60);
  const [customVideoLength, setCustomVideoLength] = useState('');
  const [selectedHooks, setSelectedHooks] = useState<Set<string>>(new Set());
  const [showCopyOptions, setShowCopyOptions] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [downloadOptions, setDownloadOptions] = useState({
    titles: true,
    whyItWorks: true,
    scripts: true,
  });

  const [pillars, setPillars] = useState<PillarInfo[]>([]);
  const [exporting, setExporting] = useState(false);
  const completedRefIds = (generation.reference_video_ids ?? []) as string[];
  const selectedCount = ideas.filter((i) => i.selected).length;
  const effectiveCta = ctaType === 'custom' ? customCta : ctaType === 'comment' ? `Comment "${commentWord || 'YES'}"` : ctaType;
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
          href={searchId ? `/finder/${searchId}` : '/finder/new'}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-accent2-text hover:text-accent2-text"
        >
          <ArrowLeft size={14} />
          {searchId ? 'Back to topic research' : 'Back to research'}
        </Link>
      </div>
    );
  }

  // ── Processing state ──
  if (generation.status === 'processing') {
    const returnHref = generation.search_id
      ? `/finder/${generation.search_id}`
      : '/finder/new';

    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <motion.div
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent2-surface border border-accent2/20 mb-4"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Sparkles size={28} className="text-accent2-text" />
        </motion.div>
        <p className="text-sm font-medium text-text-secondary">Generating ideas...</p>
        <p className="text-xs text-text-muted mt-1">This usually takes 10-30 seconds</p>
        <Link
          href={returnHref}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-accent2-text hover:text-accent2-text transition-colors"
        >
          <ArrowLeft size={14} />
          Return back to research
        </Link>
        <div className="mt-6 grid grid-cols-2 gap-3 w-full max-w-lg">
          {Array.from({ length: 4 }).map((_, i) => (
            <motion.div
              key={i}
              className="rounded-xl border border-accent2/10 bg-surface p-4 space-y-2"
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
            >
              <div className="h-4 rounded bg-accent2-surface w-3/4" />
              <div className="h-3 rounded bg-accent2/5 w-full" />
              <div className="h-3 rounded bg-accent2/5 w-2/3" />
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
                video_length_seconds: videoLength,
                target_word_count: Math.round((videoLength / 60) * 130),
                hook_strategies: selectedHooks.size > 0 ? Array.from(selectedHooks) : undefined,
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

  // ── Replace ──
  const handleReplace = async (index: number) => {
    const old = ideas[index];
    if (!old || old.replacing) return;

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

    setIdeas((prev) => prev.map((idea, i) => (i === index ? { ...idea, replacing: true } : idea)));

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
        const hadScript = !!old.script;
        setIdeas((prev) => prev.map((idea, i) => (i === index ? { ...newIdea, saved: false, selected: false, scriptLoading: hadScript } : idea)));

        // Auto-generate script if the replaced idea had one
        if (hadScript && generation.client_id) {
          try {
            const scriptRes = await fetch('/api/ideas/generate-script', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                client_id: generation.client_id,
                title: newIdea.title,
                why_it_works: newIdea.why_it_works,
                content_pillar: newIdea.content_pillar,
                reference_video_ids: completedRefIds.length > 0 ? completedRefIds : undefined,
                cta: effectiveCta || undefined,
                video_length_seconds: videoLength,
                target_word_count: Math.round((videoLength / 60) * 130),
              }),
            });
            if (scriptRes.ok) {
              const scriptData = await scriptRes.json();
              setIdeas((prev) => prev.map((i, idx) => (idx === index ? { ...i, script: scriptData.script, scriptLoading: false } : i)));
            } else {
              setIdeas((prev) => prev.map((i, idx) => (idx === index ? { ...i, scriptLoading: false } : i)));
            }
          } catch {
            setIdeas((prev) => prev.map((i, idx) => (idx === index ? { ...i, scriptLoading: false } : i)));
          }
        }
      } else {
        toast.error('Failed to generate replacement');
        setIdeas((prev) => prev.map((idea, i) => (i === index ? { ...old, replacing: false } : idea)));
      }
    } catch {
      toast.error('Failed to replace idea');
      setIdeas((prev) => prev.map((idea, i) => (i === index ? { ...old, replacing: false } : idea)));
    }
  };

  // ── Replace all ──
  const handleReplaceAll = async () => {
    const toReplace = selectedCount > 0
      ? ideas.map((idea, i) => idea.selected ? i : -1).filter((i) => i >= 0)
      : ideas.map((_, i) => i);

    for (const index of toReplace) {
      handleReplace(index);
    }
    toast.success(`Replacing ${toReplace.length} idea${toReplace.length !== 1 ? 's' : ''}...`);
  };

  // ── Export PDF ──
  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { IdeasPdfDocument } = await import('@/lib/pdf/ideas-template');

      const blob = await pdf(
        IdeasPdfDocument({
          ideas: ideas.map((i) => ({
            title: i.title,
            why_it_works: normalizeReasons(i.why_it_works),
            content_pillar: i.content_pillar,
            script: i.script,
          })),
          clientName,
          agency: agency ?? null,
          concept: generation.concept,
          searchQuery,
          includeScripts: downloadOptions.scripts,
        })
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_video_ideas.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF exported');
    } catch (err) {
      console.error('PDF export error:', err);
      toast.error('Failed to export PDF');
    } finally {
      setExporting(false);
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
    const selected = ideas.filter((i) => i.selected);
    const toCopy = selected.length > 0 ? selected : ideas;
    const text = toCopy.map((i) => {
      const parts: string[] = [];
      if (downloadOptions.titles) parts.push(i.title);
      if (downloadOptions.whyItWorks) {
        const reasons = normalizeReasons(i.why_it_works);
        parts.push(reasons.map((r) => `  • ${r}`).join('\n'));
      }
      if (downloadOptions.scripts && i.script) {
        parts.push(`Script:\n  ${i.script.split('\n').join('\n  ')}`);
      }
      return parts.join('\n');
    }).join('\n\n---\n\n');
    await navigator.clipboard.writeText(text);
    setShowCopyOptions(false);
    toast.success(`${toCopy.length} idea${toCopy.length !== 1 ? 's' : ''} copied`);
  };

  // ── Download ──
  const handleDownload = () => {
    const selected = ideas.filter((i) => i.selected);
    const toCopy = selected.length > 0 ? selected : ideas;
    const lines: string[] = [];
    for (const idea of toCopy) {
      if (downloadOptions.titles) lines.push(idea.title);
      if (downloadOptions.whyItWorks) {
        const reasons = normalizeReasons(idea.why_it_works);
        lines.push('');
        reasons.forEach((r) => lines.push(`  • ${r}`));
      }
      if (downloadOptions.scripts && idea.script) {
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
          href={searchId ? `/finder/${searchId}` : '/finder/new'}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors mb-3"
        >
          <ArrowLeft size={14} />
          {searchId ? 'Back to topic research' : 'Back to research'}
        </Link>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent2-surface">
            <Sparkles size={20} className="text-accent2-text" />
          </div>
          <div>
            <h1 className="ui-page-title-md">
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

      {/* Action bar */}
      <div className="rounded-xl border border-nativz-border bg-surface p-3 flex items-center gap-3 flex-wrap">
        {/* Selection status */}
        <span className="text-xs font-medium text-text-secondary">
          {selectedCount > 0
            ? `${selectedCount} idea${selectedCount !== 1 ? 's' : ''} selected`
            : 'Select ideas for bulk actions'}
        </span>

        {selectedCount > 0 ? (
          <button
            onClick={deselectAll}
            className="text-xs text-accent2-text hover:text-accent2-text cursor-pointer"
          >
            Deselect
          </button>
        ) : (
          <button
            onClick={selectAll}
            className="text-xs text-accent2-text hover:text-accent2-text cursor-pointer"
          >
            Select all
          </button>
        )}

        <div className="flex-1" />

        {/* Unified actions row */}
        <button
          onClick={() => selectedCount > 0 ? setShowScriptModal(true) : (selectAll(), setTimeout(() => setShowScriptModal(true), 50))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent2-surface border border-accent2/30 px-3 py-1.5 text-xs font-medium text-accent2-text hover:bg-accent2-surface transition-colors cursor-pointer"
        >
          <FileText size={12} />
          Generate scripts{selectedCount > 0 ? ` (${selectedCount})` : ' (all)'}
        </button>
        <button
          onClick={handleReplaceAll}
          className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors"
        >
          <RefreshCw size={12} />
          Replace{selectedCount > 0 ? ` (${selectedCount})` : ' all'}
        </button>
        <button
          onClick={handleSaveAll}
          disabled={ideas.every((i) => i.saved) || !generation.client_id}
          className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-40 cursor-pointer transition-colors"
        >
          <Bookmark size={12} />
          Save{selectedCount > 0 ? ` (${selectedCount})` : ' all'}
        </button>
        <div className="relative">
          <button
            onClick={() => setShowCopyOptions(!showCopyOptions)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors"
          >
            <Copy size={12} />
            Copy{selectedCount > 0 ? ` (${selectedCount})` : ' all'}
            <ChevronDown size={10} />
          </button>
          {showCopyOptions && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowCopyOptions(false)} />
              <div className="absolute top-full right-0 mt-1 z-50 bg-surface border border-nativz-border rounded-xl shadow-xl p-3 min-w-[200px] space-y-2">
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Include in copy</p>
                {([
                  ['titles', 'Titles'] as const,
                  ['whyItWorks', 'Why it works'] as const,
                  ...(ideas.some((i) => i.script) ? [['scripts', 'Scripts'] as const] : []),
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
                  onClick={handleCopySelected}
                  className="w-full mt-2 rounded-lg bg-accent2 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 cursor-pointer"
                >
                  Copy to clipboard
                </button>
              </div>
            </>
          )}
        </div>
        <button
          onClick={handleExportPdf}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors disabled:opacity-40"
        >
          {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          {exporting ? 'Exporting...' : 'Export PDF'}
        </button>
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
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-accent2/20">
                  {pillar.emoji && <span className="text-base">{pillar.emoji}</span>}
                  <h3 className="text-sm font-semibold text-accent2-text">{pillar.name}</h3>
                  <span className="text-xs text-text-muted">{pillarIdeas.length} ideas</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <AnimatePresence mode="popLayout">
                    {pillarIdeas.map(({ idea, originalIndex }) => (
                      <IdeaResultCard
                        key={`${idea.title}-${originalIndex}`}
                        idea={idea}
                        index={originalIndex}
                        onReplace={handleReplace}
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
                  <span className="text-xs text-text-muted">{ungrouped.length} ideas</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <AnimatePresence mode="popLayout">
                    {ungrouped.map(({ idea, originalIndex }) => (
                      <IdeaResultCard
                        key={`${idea.title}-${originalIndex}`}
                        idea={idea}
                        index={originalIndex}
                        onReplace={handleReplace}
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
                onReplace={handleReplace}
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
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent2-surface">
                  <FileText size={20} className="text-accent2-text" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Generate scripts</h2>
                  <p className="text-sm text-text-muted">{selectedCount} idea{selectedCount !== 1 ? 's' : ''} selected</p>
                </div>
              </div>

              <div className="rounded-xl border border-nativz-border bg-background p-3 mb-4 max-h-48 overflow-y-auto space-y-1.5">
                {ideas.filter((i) => i.selected).map((idea, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                    <Check size={12} className="mt-0.5 text-accent2-text shrink-0" />
                    <span className="line-clamp-1">{idea.title}</span>
                  </div>
                ))}
              </div>

              {/* CTA selection */}
              <div className="flex items-center gap-1.5 mb-2">
                <label className="text-xs text-text-muted">Select a call-to-action</label>
                <div className="group relative">
                  <HelpCircle size={12} className="text-text-muted/50 hover:text-text-muted cursor-help" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-3 py-2 rounded-lg bg-background border border-nativz-border text-xs text-text-secondary w-52 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-xl z-10">
                    A call-to-action tells viewers what to do after watching — like calling, clicking a link, or leaving a comment.
                  </div>
                </div>
              </div>
              <div className="space-y-1.5 mb-5">
                {CTA_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => { setCtaType(preset.value); if (!('isComment' in preset)) setCommentWord(''); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left transition-colors cursor-pointer ${
                      ctaType === preset.value
                        ? 'bg-accent2-surface text-accent2-text border border-accent2/30'
                        : 'bg-white/[0.04] text-text-muted border border-transparent hover:bg-white/[0.08]'
                    }`}
                  >
                    <preset.icon size={14} className="shrink-0" />
                    {'isComment' in preset ? (
                      <span className="flex-1">
                        Comment &ldquo;
                        <input
                          type="text"
                          value={commentWord}
                          onChange={(e) => { e.stopPropagation(); setCommentWord(e.target.value); setCtaType('comment'); }}
                          onClick={(e) => { e.stopPropagation(); setCtaType('comment'); }}
                          placeholder="YES"
                          className="bg-transparent border-b border-accent2/40 text-accent2-text placeholder:text-accent2-text/40 outline-none w-16 text-center text-sm font-medium"
                        />
                        &rdquo;
                      </span>
                    ) : (
                      <span>{preset.label}</span>
                    )}
                  </button>
                ))}
                {/* Custom CTA */}
                <button
                  onClick={() => setCtaType('custom')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left transition-colors cursor-pointer ${
                    ctaType === 'custom'
                      ? 'bg-accent2-surface text-accent2-text border border-accent2/30'
                      : 'bg-white/[0.04] text-text-muted border border-transparent hover:bg-white/[0.08]'
                  }`}
                >
                  <Pencil size={14} className="shrink-0" />
                  {ctaType === 'custom' ? (
                    <input
                      type="text"
                      value={customCta}
                      onChange={(e) => setCustomCta(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Type custom CTA..."
                      autoFocus
                      className="bg-transparent text-accent2-text placeholder:text-accent2-text/40 outline-none w-full text-sm"
                    />
                  ) : (
                    <span>Custom</span>
                  )}
                </button>
              </div>

              {/* Video length */}
              <label className="text-xs text-text-muted mb-2 block">Video length</label>
              <div className="flex items-center gap-2 mb-1.5">
                {[15, 30, 60, 90].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => { setVideoLength(sec); setCustomVideoLength(''); }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      videoLength === sec && !customVideoLength
                        ? 'bg-accent2-surface text-accent2-text border border-accent2/30'
                        : 'bg-white/[0.04] text-text-muted border border-transparent hover:bg-white/[0.08]'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
                <div className="relative">
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={customVideoLength}
                    onChange={(e) => {
                      setCustomVideoLength(e.target.value);
                      const num = parseInt(e.target.value, 10);
                      if (!isNaN(num) && num >= 5 && num <= 180) setVideoLength(num);
                    }}
                    placeholder="#"
                    className={`w-16 px-3 py-2 rounded-lg text-sm font-medium text-center transition-colors focus:outline-none ${
                      customVideoLength
                        ? 'bg-accent2-surface text-accent2-text border border-accent2/30'
                        : 'bg-white/[0.04] text-text-muted border border-transparent hover:bg-white/[0.08]'
                    }`}
                  />
                  {customVideoLength && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-accent2-text/60 pointer-events-none">s</span>}
                </div>
              </div>
              <p className="text-xs text-text-muted mb-5">
                ~{Math.round((videoLength / 60) * 130)} words at ~130 wpm
              </p>

              {/* Hook strategies */}
              <label className="text-xs text-text-muted mb-2 block">Hook style (optional)</label>
              <div className="grid grid-cols-2 gap-1.5 mb-5">
                {HOOK_STRATEGIES.map((hook) => (
                  <button
                    key={hook.id}
                    onClick={() => setSelectedHooks((prev) => {
                      const next = new Set(prev);
                      if (next.has(hook.id)) next.delete(hook.id);
                      else next.add(hook.id);
                      return next;
                    })}
                    className={`group/hook relative flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                      selectedHooks.has(hook.id)
                        ? 'bg-accent2-surface text-accent2-text border border-accent2/30'
                        : 'bg-white/[0.04] text-text-muted border border-transparent hover:bg-white/[0.08]'
                    }`}
                  >
                    <div className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
                      selectedHooks.has(hook.id)
                        ? 'border-accent2 bg-accent2-surface'
                        : 'border-white/20 bg-transparent'
                    }`}>
                      {selectedHooks.has(hook.id) && <Check size={8} />}
                    </div>
                    <span>{hook.label}</span>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2.5 py-1.5 rounded-lg bg-background border border-nativz-border text-[10px] text-text-secondary whitespace-nowrap opacity-0 pointer-events-none group-hover/hook:opacity-100 transition-opacity shadow-xl z-10">
                      {hook.example}
                    </div>
                  </button>
                ))}
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
                    deselectAll();
                  }}
                  disabled={ideas.some((i) => i.selected && i.scriptLoading)}
                  className="rounded-xl bg-accent2-surface border border-accent2/30 px-5 py-2.5 text-sm font-medium text-accent2-text hover:bg-accent2/25 transition-colors disabled:opacity-40 cursor-pointer"
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
