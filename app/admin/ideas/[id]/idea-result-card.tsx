'use client';

import {
  RefreshCw, Bookmark, Check,
  Loader2, Zap,
  CheckSquare, Square,
  Sparkles,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import type { GeneratedIdea } from './types';

// ── Helpers ─────────────────────────────────────────────────────────────────

export function normalizeReasons(why: string | string[]): string[] {
  if (Array.isArray(why)) return why;
  return why
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ── Replace Loading Animation ────────────────────────────────────────────────

function ReplaceSkeleton() {
  return (
    <div className="rounded-xl border border-purple-500/20 bg-surface p-4 flex flex-col items-center justify-center min-h-[160px] space-y-3">
      <motion.div
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Sparkles size={18} className="text-purple-400" />
      </motion.div>
      <div className="flex items-center gap-2">
        <Loader2 size={12} className="animate-spin text-purple-400" />
        <span className="text-xs text-purple-400/70">Replacing idea...</span>
      </div>
      <div className="w-full space-y-2 pt-2">
        {[0.8, 0.6, 0.7].map((w, i) => (
          <motion.div
            key={i}
            className="h-2.5 rounded bg-purple-500/10 mx-auto"
            style={{ width: `${w * 100}%` }}
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Idea Card ───────────────────────────────────────────────────────────────

export function IdeaResultCard({
  idea,
  index,
  onReplace,
  onSave,
  onToggleSelect,
  selectionMode,
}: {
  idea: GeneratedIdea;
  index: number;
  onReplace: (index: number) => void;
  onSave: (index: number) => void;
  onToggleSelect: (index: number) => void;
  selectionMode: boolean;
}) {
  const reasons = normalizeReasons(idea.why_it_works);

  if (idea.replacing) {
    return <ReplaceSkeleton />;
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
            onClick={(e) => { e.stopPropagation(); onReplace(index); }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all cursor-pointer"
            title="Replace this idea"
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
