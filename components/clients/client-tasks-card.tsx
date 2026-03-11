'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  CheckSquare,
  Plus,
  Calendar,
  Loader2,
  Circle,
  CheckCircle2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassButton } from '@/components/ui/glass-button';
import { EmptyState } from '@/components/shared/empty-state';
import { toast } from 'sonner';

interface Task {
  id: string;
  title: string;
  status: 'backlog' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  task_type: string;
  team_members: { id: string; full_name: string; avatar_url: string | null } | null;
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-blue-500',
  low: 'bg-white/30',
};

function formatDueDate(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = d.getTime() - now.getTime();
  const days = Math.round(diff / 86400000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ClientTasksCard({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?client_id=${clientId}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setTasks(data);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  async function toggleComplete(task: Task) {
    const newStatus = task.status === 'done' ? 'backlog' : 'done';
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)),
    );

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      fetchTasks();
      toast.error('Failed to update task');
    }
  }

  const active = tasks.filter((t) => t.status !== 'done');
  const done = tasks.filter((t) => t.status === 'done');

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Tasks</h2>
          <p className="text-xs text-text-muted mt-0.5">
            {active.length} active · {done.length} completed
          </p>
        </div>
        <Link href={`/admin/tasks?client=${clientId}`}>
          <Button size="sm" variant="outline">
            <CheckSquare size={14} />
            View all
          </Button>
        </Link>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-text-muted" />
        </div>
      )}

      {!loading && tasks.length === 0 && (
        <EmptyState
          icon={<CheckSquare size={24} />}
          title="No tasks"
          description={`No tasks for ${clientName} yet.`}
        />
      )}

      {!loading && active.length > 0 && (
        <div className="space-y-1">
          {active.slice(0, 5).map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-hover transition-colors group"
            >
              <button
                type="button"
                onClick={() => toggleComplete(task)}
                className="shrink-0 text-text-muted/40 hover:text-accent-text transition-colors"
              >
                <Circle size={16} />
              </button>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">{task.title}</p>
              </div>
              {task.team_members && (
                <div
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-text-secondary"
                  title={task.team_members.full_name}
                >
                  {task.team_members.full_name
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
              )}
              {task.due_date && (
                <span className="text-[10px] text-text-muted whitespace-nowrap">
                  {formatDueDate(task.due_date)}
                </span>
              )}
            </div>
          ))}
          {active.length > 5 && (
            <Link
              href={`/admin/tasks?client=${clientId}`}
              className="block px-3 py-2 text-xs text-accent-text hover:text-accent-hover transition-colors"
            >
              +{active.length - 5} more tasks
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
