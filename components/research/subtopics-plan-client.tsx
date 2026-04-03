'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { TIME_RANGE_OPTIONS } from '@/lib/types/search';

interface SubtopicsPlanClientProps {
  searchId: string;
  query: string;
  /** User-selected recency window (e.g. "Last 3 months") — keywords must fit this period. */
  timeRangeLabel: string;
  initialTimeRange?: string;
  initialSource?: string;
}

const MAX = 15;

const PLATFORM_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Reddit', value: 'reddit' },
  { label: 'X', value: 'twitter' },
] as const;

export function SubtopicsPlanClient({
  searchId,
  query,
  timeRangeLabel,
  initialTimeRange = 'last_3_months',
  initialSource = 'all',
}: SubtopicsPlanClientProps) {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [timeRange, setTimeRange] = useState(initialTimeRange);
  const [source, setSource] = useState(initialSource);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/search/${searchId}/plan-subtopics`, { method: 'POST' });
      const data = (await res.json()) as { subtopics?: string[]; error?: string };
      if (!res.ok) {
        toast.error(data.error || 'Could not generate keywords');
        setKeywords([query]);
        setSelected(new Set([query]));
        return;
      }
      const kws = (data.subtopics ?? []).slice(0, 10);
      setKeywords(kws);
      setSelected(new Set(kws));
    } catch {
      toast.error('Failed to load keywords');
      setKeywords([query]);
      setSelected(new Set([query]));
    } finally {
      setLoading(false);
    }
  }, [searchId, query]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  function toggleKeyword(kw: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kw)) {
        next.delete(kw);
      } else {
        next.add(kw);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(keywords));
  }

  function addCustomKeyword() {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (keywords.includes(trimmed)) {
      toast.error('Keyword already exists');
      return;
    }
    if (keywords.length >= MAX) {
      toast.error(`Maximum ${MAX} keywords`);
      return;
    }
    setKeywords((prev) => [...prev, trimmed]);
    setSelected((prev) => new Set(prev).add(trimmed));
    setCustomInput('');
  }

  function handleCustomKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomKeyword();
    }
  }

  async function confirmAndRun() {
    const cleaned = Array.from(selected).filter(Boolean);
    if (cleaned.length === 0) {
      toast.error('Select at least one keyword');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/search/${searchId}/subtopics`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtopics: cleaned, start_processing: true, timeRange }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error || 'Could not save');
        return;
      }
      // Full navigation so the processing page always loads fresh DB state
      window.location.assign(`/admin/search/${searchId}/processing`);
    } catch {
      toast.error('Failed to start research');
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = selected.size;
  const totalCount = keywords.length;

  const selectedTimeRangeLabel =
    TIME_RANGE_OPTIONS.find((o) => o.value === timeRange)?.label ?? timeRangeLabel;
  const selectedPlatformLabel =
    PLATFORM_OPTIONS.find((o) => o.value === source)?.label ?? 'All';

  return (
    <div className="cortex-page-gutter max-w-2xl mx-auto space-y-6 py-8">
      <Breadcrumbs
        className="mb-2"
        items={[
          { label: 'Search history', href: '/admin/search/new' },
          { label: 'Keyword picker' },
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
          <h1 className="text-lg font-semibold text-text-primary break-words">Keyword picker</h1>
          <p className="text-sm text-text-muted">
            Topic: <span className="text-text-secondary">&ldquo;{query}&rdquo;</span>
            {' · '}
            <span className="text-text-secondary">{timeRangeLabel}</span>
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-muted py-8">
          <Loader2 className="animate-spin shrink-0" size={18} />
          Generating keywords…
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header row: counter + actions */}
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent-text">
              {selectedCount}/{totalCount} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                disabled={selectedCount === totalCount}
                className="text-xs text-text-muted hover:text-text-secondary transition-colors disabled:opacity-40"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => void loadPlan()}
                disabled={saving}
                className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                <RefreshCw size={12} />
                Regenerate
              </button>
            </div>
          </div>

          {/* Keyword chips */}
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw) => {
              const isSelected = selected.has(kw);
              return (
                <button
                  key={kw}
                  type="button"
                  onClick={() => toggleKeyword(kw)}
                  className={`
                    inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium
                    transition-all duration-150 ease-out cursor-pointer select-none
                    ${
                      isSelected
                        ? 'bg-accent/20 text-accent-text border border-accent/40'
                        : 'bg-surface-hover text-text-muted border border-nativz-border hover:border-text-muted'
                    }
                  `}
                >
                  {isSelected ? (
                    <Check size={14} className="shrink-0" />
                  ) : (
                    <Plus size={14} className="shrink-0" />
                  )}
                  {kw}
                </button>
              );
            })}
          </div>

          {/* Custom keyword input */}
          <div className="flex gap-2 items-center pt-2">
            <input
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={handleCustomKeyDown}
              className="flex-1 rounded-xl border border-nativz-border bg-surface-hover px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-accent/50"
              placeholder="e.g. morning routine tips"
              maxLength={100}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCustomKeyword}
              disabled={!customInput.trim() || keywords.length >= MAX}
              className="gap-1 shrink-0"
            >
              <Plus size={14} />
              Add
            </Button>
          </div>

          {/* Tip */}
          <p className="text-xs text-text-muted/70 leading-relaxed">
            Two to three word phrases like &ldquo;cooking hacks&rdquo; or &ldquo;indie game dev&rdquo; find much more relevant content than single generic words.
          </p>

          {/* Date range */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-primary">Date range</p>
            <div className="flex flex-wrap gap-2">
              {TIME_RANGE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setTimeRange(o.value)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-150 ${
                    timeRange === o.value
                      ? 'bg-accent/20 text-accent-text border border-accent/40'
                      : 'bg-surface border border-nativz-border text-text-muted hover:border-text-muted'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Platforms */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-primary">Platforms</p>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setSource(o.value)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-150 ${
                    source === o.value
                      ? 'bg-accent/20 text-accent-text border border-accent/40'
                      : 'bg-surface border border-nativz-border text-text-muted hover:border-text-muted'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary line */}
          <p className="flex items-center gap-1.5 text-sm text-text-secondary">
            <Check size={14} className="shrink-0 text-emerald-400" />
            {selectedTimeRangeLabel} · {selectedPlatformLabel}
          </p>
        </div>
      )}

      {/* Bottom actions */}
      <div className="flex items-center justify-between pt-4 border-t border-nativz-border">
        <Link href="/admin/search/new">
          <Button type="button" variant="outline">
            Back
          </Button>
        </Link>
        <Button type="button" onClick={() => void confirmAndRun()} disabled={loading || saving || selectedCount === 0}>
          {saving ? (
            <>
              <Loader2 className="animate-spin mr-2" size={16} />
              Starting…
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </div>
    </div>
  );
}
