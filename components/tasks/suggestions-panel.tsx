'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Check,
  Loader2,
  Calendar,
  FileText,
  Layers,
  ExternalLink,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { GlassButton } from '@/components/ui/glass-button';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Suggestion {
  monday_item_id: string;
  name: string;
  client: string;
  board_source: 'content_calendar' | 'content_request' | 'blog';
  status: string;
  due_date: string | null;
  details: Record<string, string>;
  already_imported: boolean;
}

interface SuggestionsPanelProps {
  onTaskCreated?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const BOARD_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  content_calendar: {
    label: 'Content calendar',
    icon: <Calendar size={12} />,
    color: 'bg-blue-500/15 text-blue-400 ring-blue-500/20',
  },
  content_request: {
    label: 'Content request',
    icon: <FileText size={12} />,
    color: 'bg-purple-500/15 text-purple-400 ring-purple-500/20',
  },
  blog: {
    label: 'Blog pipeline',
    icon: <Layers size={12} />,
    color: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SuggestionsPanel({ onTaskCreated }: SuggestionsPanelProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('cortex:suggestions-collapsed') !== 'false';
  });
  const [importingId, setImportingId] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks/suggestions');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch {
      // Silently fail — suggestions are non-critical
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!collapsed && !hasLoaded) {
      fetchSuggestions();
    }
  }, [collapsed, hasLoaded, fetchSuggestions]);

  function handleToggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('cortex:suggestions-collapsed', String(next));
  }

  async function handleImport(suggestion: Suggestion) {
    setImportingId(suggestion.monday_item_id);
    try {
      const taskType = suggestion.board_source === 'content_calendar'
        ? 'content'
        : suggestion.board_source === 'blog'
          ? 'strategy'
          : 'other';

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: suggestion.name,
          client_id: null, // Would need client matching — skip for now
          due_date: suggestion.due_date ?? null,
          task_type: taskType,
          monday_item_id: suggestion.monday_item_id,
          status: 'backlog',
          priority: 'low',
        }),
      });

      if (!res.ok) throw new Error('Failed to create task');

      // Mark as imported locally
      setSuggestions((prev) =>
        prev.map((s) =>
          s.monday_item_id === suggestion.monday_item_id
            ? { ...s, already_imported: true }
            : s,
        ),
      );

      toast.success(`Task created: ${suggestion.name}`);
      onTaskCreated?.();
    } catch {
      toast.error('Failed to import task');
    } finally {
      setImportingId(null);
    }
  }

  const actionable = suggestions.filter((s) => !s.already_imported);
  const imported = suggestions.filter((s) => s.already_imported);

  return (
    <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          {collapsed ? <ChevronRight size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
          <span className="text-sm font-semibold text-text-primary">Monday.com suggestions</span>
          {actionable.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-surface px-1.5 text-[10px] font-bold text-accent-text">
              {actionable.length}
            </span>
          )}
        </div>
        <ExternalLink size={12} className="text-text-muted/50" />
      </button>

      {/* Content */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-nativz-border">
              {loading && !hasLoaded && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={18} className="animate-spin text-text-muted" />
                </div>
              )}

              {hasLoaded && suggestions.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs text-text-muted">All caught up — nothing needs attention on Monday.com</p>
                </div>
              )}

              {hasLoaded && actionable.length > 0 && (
                <div className="divide-y divide-white/[0.04]">
                  {actionable.map((s) => (
                    <div
                      key={s.monday_item_id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{s.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${BOARD_LABELS[s.board_source]?.color}`}>
                            {BOARD_LABELS[s.board_source]?.icon}
                            {BOARD_LABELS[s.board_source]?.label}
                          </span>
                          {s.client && (
                            <span className="text-[10px] text-text-muted">{s.client}</span>
                          )}
                          {s.status && (
                            <span className="text-[10px] text-text-muted">· {s.status}</span>
                          )}
                          {s.due_date && (
                            <span className="text-[10px] text-text-muted">· {new Date(s.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          )}
                        </div>
                      </div>
                      <GlassButton
                        onClick={() => handleImport(s)}
                        loading={importingId === s.monday_item_id}
                        disabled={importingId !== null}
                        className="text-xs px-3 py-1.5"
                      >
                        <Plus size={12} />
                        Add
                      </GlassButton>
                    </div>
                  ))}
                </div>
              )}

              {hasLoaded && imported.length > 0 && (
                <div className="border-t border-white/[0.04]">
                  <div className="px-4 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted/50">Already added</p>
                  </div>
                  {imported.slice(0, 3).map((s) => (
                    <div
                      key={s.monday_item_id}
                      className="flex items-center gap-3 px-4 py-2 opacity-50"
                    >
                      <Check size={14} className="shrink-0 text-emerald-500" />
                      <p className="text-xs text-text-muted truncate flex-1">{s.name}</p>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${BOARD_LABELS[s.board_source]?.color}`}>
                        {BOARD_LABELS[s.board_source]?.icon}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
