'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Sparkles, RefreshCw, Bookmark, Check, FileText,
  Loader2, Copy, Download, ChevronDown, ArrowLeft,
  Building2, Search, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

// ── Types ───────────────────────────────────────────────────────────────────

interface GeneratedIdea {
  title: string;
  why_it_works: string;
  content_pillar: string;
  script?: string;
  scriptLoading?: boolean;
  saved?: boolean;
}

interface Generation {
  id: string;
  client_id: string;
  concept: string | null;
  count: number;
  reference_video_ids: string[];
  search_id: string | null;
  ideas: GeneratedIdea[];
  status: string;
  error_message: string | null;
  tokens_used: number;
  estimated_cost: number;
  created_at: string;
  completed_at: string | null;
}

interface IdeasResultsClientProps {
  generation: Generation;
  clientName: string;
  searchQuery: string | null;
}

// ── Idea Card ───────────────────────────────────────────────────────────────

function IdeaResultCard({
  idea,
  index,
  onReroll,
  onSave,
  onGenerateScript,
  onUpdateScript,
}: {
  idea: GeneratedIdea;
  index: number;
  onReroll: (index: number) => void;
  onSave: (index: number) => void;
  onGenerateScript: (index: number) => void;
  onUpdateScript: (index: number, text: string) => void;
}) {
  return (
    <div className="group rounded-xl border border-nativz-border bg-surface p-4 space-y-3 transition-all hover:border-accent/30">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary leading-snug flex-1">{idea.title}</h3>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onReroll(index)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all cursor-pointer"
            title="Re-roll this idea"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={() => onSave(index)}
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

      <p className="text-xs text-text-secondary leading-relaxed">{idea.why_it_works}</p>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-text-muted">{idea.content_pillar}</span>
        {!idea.script && !idea.scriptLoading && (
          <button
            onClick={() => onGenerateScript(index)}
            className="inline-flex items-center gap-1.5 text-[11px] text-accent-text hover:text-accent-text/80 transition-colors cursor-pointer"
          >
            <FileText size={11} />
            Generate script
          </button>
        )}
        {idea.scriptLoading && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
            <Loader2 size={11} className="animate-spin" />
            Writing script…
          </span>
        )}
      </div>

      {idea.script && (
        <div className="space-y-2 pt-2 border-t border-nativz-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Script</span>
            <button
              onClick={() => onGenerateScript(index)}
              className="inline-flex items-center gap-1 text-[10px] text-accent-text hover:text-accent-text/80 cursor-pointer"
            >
              <RefreshCw size={9} />
              Regenerate
            </button>
          </div>
          <textarea
            value={idea.script}
            onChange={(e) => onUpdateScript(index, e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-xs text-text-primary leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-accent/50 font-mono"
          />
        </div>
      )}
    </div>
  );
}

// ── Results Client ──────────────────────────────────────────────────────────

export function IdeasResultsClient({ generation, clientName, searchQuery }: IdeasResultsClientProps) {
  const [ideas, setIdeas] = useState<GeneratedIdea[]>(
    (generation.ideas ?? []).map((i: GeneratedIdea) => ({ ...i, saved: false })),
  );
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [downloadOptions, setDownloadOptions] = useState({
    titles: true,
    scripts: true,
    whyItWorks: false,
    referenceBreakdowns: false,
  });

  const hasScripts = ideas.some((i) => i.script);
  const completedRefIds = (generation.reference_video_ids ?? []) as string[];

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
          href="/admin/ideas"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-accent-text hover:text-accent-text/80"
        >
          <ArrowLeft size={14} />
          Back to ideas
        </Link>
      </div>
    );
  }

  // ── Processing state ──
  if (generation.status === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Loader2 size={32} className="animate-spin text-accent-text mb-4" />
        <p className="text-sm font-medium text-text-secondary">Generating ideas…</p>
        <p className="text-xs text-text-muted mt-1">This usually takes 10-30 seconds.</p>
      </div>
    );
  }

  // ── Re-roll ──
  const handleReroll = async (index: number) => {
    const old = ideas[index];
    if (!old) return;

    fetch('/api/ideas/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: generation.client_id,
        title: old.title,
        description: old.why_it_works,
        content_pillar: old.content_pillar,
      }),
    }).catch(() => {});

    setIdeas((prev) => prev.map((idea, i) => (i === index ? { ...idea, title: '…', why_it_works: 'Generating replacement…', scriptLoading: false, script: undefined } : idea)));

    try {
      const res = await fetch('/api/ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: generation.client_id,
          concept: generation.concept ?? undefined,
          count: 1,
          reference_video_ids: completedRefIds.length > 0 ? completedRefIds : undefined,
          search_id: generation.search_id ?? undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const newIdea = data.ideas?.[0];
      if (newIdea) {
        setIdeas((prev) => prev.map((idea, i) => (i === index ? { ...newIdea, saved: false } : idea)));
      }
    } catch {
      toast.error('Failed to re-roll idea');
      setIdeas((prev) => prev.map((idea, i) => (i === index ? old : idea)));
    }
  };

  // ── Save ──
  const handleSave = async (index: number) => {
    const idea = ideas[index];
    if (!idea || idea.saved) return;

    try {
      const res = await fetch(`/api/clients/${generation.client_id}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'idea',
          title: idea.title,
          content: `${idea.why_it_works}${idea.script ? `\n\n---\n\nScript:\n${idea.script}` : ''}`,
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

  // ── Generate script ──
  const handleGenerateScript = async (index: number) => {
    const idea = ideas[index];
    if (!idea) return;

    setIdeas((prev) => prev.map((i, idx) => (idx === index ? { ...i, scriptLoading: true } : i)));

    try {
      const res = await fetch('/api/ideas/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: generation.client_id,
          title: idea.title,
          why_it_works: idea.why_it_works,
          content_pillar: idea.content_pillar,
          reference_video_ids: completedRefIds.length > 0 ? completedRefIds : undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setIdeas((prev) =>
        prev.map((i, idx) => (idx === index ? { ...i, script: data.script, scriptLoading: false } : i)),
      );
    } catch {
      toast.error('Failed to generate script');
      setIdeas((prev) => prev.map((i, idx) => (idx === index ? { ...i, scriptLoading: false } : i)));
    }
  };

  // ── Generate all scripts ──
  const handleGenerateAllScripts = async () => {
    const indices = ideas
      .map((idea, i) => (!idea.script && !idea.scriptLoading ? i : -1))
      .filter((i) => i >= 0);

    if (indices.length === 0) return;

    setIdeas((prev) => prev.map((idea, i) => (indices.includes(i) ? { ...idea, scriptLoading: true } : idea)));

    const batchSize = 3;
    for (let b = 0; b < indices.length; b += batchSize) {
      const batch = indices.slice(b, b + batchSize);
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
    toast.success('All scripts generated');
  };

  // ── Save all ──
  const handleSaveAll = async () => {
    const unsaved = ideas.filter((i) => !i.saved);
    for (let idx = 0; idx < ideas.length; idx++) {
      if (!ideas[idx].saved) await handleSave(idx);
    }
    toast.success(`${unsaved.length} ideas saved to library`);
  };

  // ── Copy all scripts ──
  const handleCopyAllScripts = async () => {
    const scriptIdeas = ideas.filter((i) => i.script);
    if (scriptIdeas.length === 0) return;
    const text = scriptIdeas.map((i) => `${i.title}\n\n${i.script}`).join('\n\n---\n\n');
    await navigator.clipboard.writeText(text);
    toast.success('Scripts copied to clipboard');
  };

  // ── Download ──
  const handleDownload = () => {
    const lines: string[] = [];
    for (const idea of ideas) {
      if (downloadOptions.titles) lines.push(idea.title);
      if (downloadOptions.scripts && idea.script) {
        lines.push('');
        lines.push(idea.script);
      }
      if (downloadOptions.whyItWorks) {
        lines.push('');
        lines.push(`Why it works: ${idea.why_it_works}`);
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${clientName}-scripts.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setShowDownloadOptions(false);
  };

  const handleUpdateScript = useCallback((index: number, text: string) => {
    setIdeas((prev) => prev.map((i, idx) => (idx === index ? { ...i, script: text } : i)));
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-surface">
            <Sparkles size={20} className="text-accent-text" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-text-primary">{ideas.length} ideas generated</h1>
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
              {generation.concept && (
                <span className="text-xs text-text-muted">
                  — {generation.concept}
                </span>
              )}
            </div>
          </div>
        </div>
        <Link
          href="/admin/ideas"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors"
        >
          <ArrowLeft size={14} />
          New generation
        </Link>
      </div>

      {/* Batch actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleGenerateAllScripts}
          disabled={ideas.every((i) => i.script || i.scriptLoading)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-40 cursor-pointer transition-colors"
        >
          <FileText size={12} />
          Generate all scripts
        </button>
        <button
          onClick={handleSaveAll}
          disabled={ideas.every((i) => i.saved)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-40 cursor-pointer transition-colors"
        >
          <Bookmark size={12} />
          Save all
        </button>
        {hasScripts && (
          <>
            <button
              onClick={handleCopyAllScripts}
              className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors"
            >
              <Copy size={12} />
              Copy all scripts
            </button>
            <div className="relative">
              <button
                onClick={() => setShowDownloadOptions(!showDownloadOptions)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors"
              >
                <Download size={12} />
                Download
                <ChevronDown size={10} />
              </button>
              {showDownloadOptions && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowDownloadOptions(false)} />
                  <div className="absolute top-full right-0 mt-1 z-50 bg-surface border border-nativz-border rounded-xl shadow-xl p-3 min-w-[200px] space-y-2">
                    <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Include in download</p>
                    {([
                      ['titles', 'Titles'] as const,
                      ['scripts', 'Scripts'] as const,
                      ['whyItWorks', 'Why it works'] as const,
                      ['referenceBreakdowns', 'Reference breakdowns'] as const,
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
                      className="w-full mt-2 rounded-lg bg-accent-text px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 cursor-pointer"
                    >
                      Download .txt
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Idea cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ideas.map((idea, i) => (
          <IdeaResultCard
            key={`${idea.title}-${i}`}
            idea={idea}
            index={i}
            onReroll={handleReroll}
            onSave={handleSave}
            onGenerateScript={handleGenerateScript}
            onUpdateScript={handleUpdateScript}
          />
        ))}
      </div>
    </div>
  );
}
