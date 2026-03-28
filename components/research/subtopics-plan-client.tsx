'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';

interface SubtopicsPlanClientProps {
  searchId: string;
  query: string;
  /** User-selected recency window (e.g. "Last 3 months") — gameplan angles must fit this period. */
  timeRangeLabel: string;
}

const MAX = 5;

export function SubtopicsPlanClient({ searchId, query, timeRangeLabel }: SubtopicsPlanClientProps) {
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/search/${searchId}/plan-subtopics`, { method: 'POST' });
      const data = (await res.json()) as { subtopics?: string[]; error?: string };
      if (!res.ok) {
        toast.error(data.error || 'Could not generate research angles');
        setItems([query]);
        return;
      }
      setItems((data.subtopics ?? []).slice(0, MAX));
    } catch {
      toast.error('Failed to load plan');
      setItems([query]);
    } finally {
      setLoading(false);
    }
  }, [searchId, query]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  function updateAt(i: number, v: string) {
    setItems((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  }

  function removeAt(i: number) {
    setItems((prev) => prev.filter((_, j) => j !== i));
  }

  function addRow() {
    setItems((prev) => (prev.length >= MAX ? prev : [...prev, '']));
  }

  async function confirmAndRun() {
    const cleaned = items.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      toast.error('Add at least one research angle');
      return;
    }
    if (cleaned.length > MAX) {
      toast.error(`Maximum ${MAX} research angles`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/search/${searchId}/subtopics`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtopics: cleaned, start_processing: true }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error || 'Could not save');
        return;
      }
      // Full navigation so the processing page always loads fresh DB state (avoids stale RSC
      // still seeing pending_subtopics and redirecting back to this screen).
      window.location.assign(`/admin/search/${searchId}/processing`);
    } catch {
      toast.error('Failed to start research');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cortex-page-gutter max-w-2xl mx-auto space-y-6 py-8">
      <Breadcrumbs
        className="mb-2"
        items={[
          { label: 'Search history', href: '/admin/search/new' },
          { label: 'Research gameplan' },
        ]}
      />

      <div className="flex items-start gap-3">
        <Link
          href="/admin/search/new"
          className="mt-1 shrink-0 text-text-muted hover:text-text-secondary transition-colors"
            aria-label="Back"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-lg font-semibold text-text-primary break-words">Research gameplan</h1>
          <p className="text-sm text-text-muted">
            Topic: <span className="text-text-secondary">&ldquo;{query}&rdquo;</span>
            {' · '}
            <span className="text-text-secondary">{timeRangeLabel}</span>
          </p>
        </div>
      </div>

      <p className="text-sm text-text-muted">
        Build a gameplan: up to five research angles that together cover the full scope of this topic—each
        focused on what matters <strong className="text-text-secondary font-medium">{timeRangeLabel}</strong>{' '}
        (not generic evergreen angles). Edit, remove, or add rows, then run research to generate your report.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-muted py-8">
          <Loader2 className="animate-spin shrink-0" size={18} />
          Generating angles…
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                value={row}
                onChange={(e) => updateAt(i, e.target.value)}
                className="flex-1 rounded-xl border border-nativz-border bg-surface-hover px-3 py-2.5 text-sm text-text-primary"
                placeholder={`Research angle ${i + 1}`}
                maxLength={200}
              />
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="shrink-0 rounded-lg p-2 text-text-muted hover:text-red-400 hover:bg-surface-hover"
                aria-label="Remove"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {items.length < MAX && (
            <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1.5">
              <Plus size={14} />
              Add angle
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3 pt-4">
        <Button type="button" onClick={() => void confirmAndRun()} disabled={loading || saving}>
          {saving ? (
            <>
              <Loader2 className="animate-spin mr-2" size={16} />
              Starting…
            </>
          ) : (
            'Run research'
          )}
        </Button>
        <Button type="button" variant="outline" onClick={() => void loadPlan()} disabled={loading || saving}>
          Regenerate suggestions
        </Button>
      </div>
    </div>
  );
}
