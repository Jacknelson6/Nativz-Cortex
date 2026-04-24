'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Workflow, ArrowRight, Plus, Loader2, Sparkles, Check, Flag } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { EDITING_STATUSES } from '@/components/pipeline/pipeline-types';
import type { StatusConfig } from '@/components/pipeline/pipeline-types';

interface SuggestedTask {
  title: string;
  description: string;
  priority: string;
}

interface PipelineSummary {
  total: number;
  doneCount: number;
  editingCounts: Record<string, { count: number; clients: string[] }>;
  aiBullets: string[];
  suggestedTasks: SuggestedTask[];
  monthLabel: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#3b82f6',
  low: '#94a3b8',
};

const KANBAN_STATUSES: StatusConfig[] = EDITING_STATUSES.filter((s) => s.value !== 'not_started');

export function PipelineWidget() {
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingTasks, setAddingTasks] = useState<Set<number>>(new Set());
  const [addedTasks, setAddedTasks] = useState<Set<number>>(new Set());

  useEffect(() => {
    // Load from sessionStorage instantly, then refresh in background
    const cached = sessionStorage.getItem('pipeline-summary');
    if (cached) {
      try {
        setSummary(JSON.parse(cached));
        setLoading(false);
      } catch { /* ignore */ }
    }
    fetchSummary();
  }, []);

  async function fetchSummary() {
    try {
      const res = await fetch('/api/pipeline/summary');
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
        sessionStorage.setItem('pipeline-summary', JSON.stringify(data));
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  async function handleAddTask(task: SuggestedTask, index: number) {
    setAddingTasks((prev) => new Set(prev).add(index));
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: task.title,
          description: task.description || null,
          priority: ['urgent', 'high', 'medium', 'low'].includes(task.priority) ? task.priority : 'medium',
          due_date: new Date().toISOString().slice(0, 10),
          status: 'backlog',
        }),
      });
      if (!res.ok) throw new Error();
      setAddedTasks((prev) => new Set(prev).add(index));
      toast.success('Task added');
    } catch {
      toast.error('Failed to add task');
    } finally {
      setAddingTasks((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  }

  if (loading) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Workflow size={16} className="text-accent-text" />
          <span className="text-base font-semibold text-text-primary">Pipeline</span>
        </div>
        {/* One skeleton per loader — pipeline strip + upcoming list collapsed. */}
        <div className="h-44 w-full rounded-[var(--nz-radius-md)] bg-surface-elevated animate-pulse" />
      </Card>
    );
  }

  if (!summary || summary.total === 0) {
    return (
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
            <Workflow size={16} className="text-accent-text" />
            Pipeline
          </h2>
          <Link
            href="/admin/edits"
            className="text-xs text-text-muted hover:text-text-secondary flex items-center gap-1 transition-colors"
          >
            View pipeline <ArrowRight size={12} />
          </Link>
        </div>
        <p className="text-sm text-text-muted text-center py-6">No pipeline items this month</p>
      </Card>
    );
  }

  const completionPct = Math.round((summary.doneCount / summary.total) * 100);

  return (
    <Card padding="md">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
          <Workflow size={16} className="text-accent-text" />
          Pipeline
          <span className="text-xs font-normal text-text-muted">{summary.monthLabel}</span>
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted">
            {summary.doneCount}/{summary.total} complete
          </span>
          <Link
            href="/admin/edits"
            className="text-xs text-text-muted hover:text-text-secondary flex items-center gap-1 transition-colors"
          >
            Full view <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-white/[0.06] mb-4 overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${completionPct}%` }}
        />
      </div>

      <div className="space-y-3">
        {/* Mini kanban columns */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {KANBAN_STATUSES.map((status) => {
            const group = summary.editingCounts[status.value];
            const clients = group?.clients ?? [];
            return (
              <div
                key={status.value}
                className="flex-1 min-w-[100px] rounded-lg bg-white/[0.03] border border-nativz-border/50 p-2"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span className={`inline-flex h-2 w-2 rounded-full border ${status.color}`} />
                  <span className="text-[10px] font-medium text-text-muted truncate">
                    {status.label}
                  </span>
                  {clients.length > 0 && (
                    <span className="text-[10px] text-text-muted/60 ml-auto">{clients.length}</span>
                  )}
                </div>
                <div className="flex items-center justify-center py-1">
                  {clients.length === 0 ? (
                    <span className="text-[10px] text-text-muted/40">&mdash;</span>
                  ) : (
                    <span className={`text-lg font-bold tabular-nums ${status.color.split(' ')[1] ?? 'text-text-primary'}`}>
                      {clients.length}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* AI bullets + suggested tasks side by side */}
        <div className="grid grid-cols-[1fr_1fr] gap-4">
          {/* AI update bullets */}
          {summary.aiBullets.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles size={11} className="text-accent2-text" />
                <span className="text-[10px] font-medium text-accent2-text uppercase tracking-wide">Update</span>
              </div>
              <ul className="space-y-1.5">
                {summary.aiBullets.map((bullet, i) => {
                  // Strip any markdown **bold** markers, then bold the leading name before first colon
                  const clean = bullet.replace(/\*\*/g, '');
                  const colonIdx = clean.indexOf(':');
                  const hasLeadingName = colonIdx > 0 && colonIdx < 30;
                  return (
                    <li key={i} className="flex items-start gap-2 text-xs text-text-secondary leading-snug">
                      <span className="shrink-0 mt-[5px] h-1.5 w-1.5 rounded-full bg-accent2/40" />
                      {hasLeadingName ? (
                        <span>
                          <span className="font-medium text-text-primary">{clean.slice(0, colonIdx)}</span>
                          <span className="text-text-muted">{clean.slice(colonIdx, colonIdx + 1)}</span>
                          {clean.slice(colonIdx + 1)}
                        </span>
                      ) : (
                        clean
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Suggested tasks */}
          {summary.suggestedTasks.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-2">Suggested tasks</p>
              <div className="space-y-0.5">
                {summary.suggestedTasks.map((task, i) => {
                  const added = addedTasks.has(i);
                  const adding = addingTasks.has(i);
                  return (
                    <div
                      key={i}
                      className={`group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${
                        added ? 'opacity-50' : 'hover:bg-surface-hover'
                      }`}
                    >
                      <Flag size={12} style={{ color: PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.medium }} className="shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs ${added ? 'text-text-muted line-through' : 'text-text-secondary'}`}>
                          {task.title}
                        </span>
                        {task.description && (
                          <p className="text-[10px] text-text-muted/60 truncate">{task.description}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleAddTask(task, i)}
                        disabled={adding || added}
                        className="shrink-0 flex items-center justify-center h-6 w-6 rounded-md text-text-muted hover:text-accent-text hover:bg-accent-surface transition-colors cursor-pointer disabled:cursor-default disabled:hover:bg-transparent"
                        title={added ? 'Added' : 'Add to tasks'}
                      >
                        {adding ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : added ? (
                          <Check size={12} className="text-emerald-400" />
                        ) : (
                          <Plus size={12} />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
