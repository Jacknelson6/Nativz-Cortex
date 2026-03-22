'use client';

import { useState } from 'react';
import { ArrowLeft, Save, Instagram, Wand2, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { InstagramMockup } from '@/components/presentations/social-results/instagram-mockup';
import type { PresentationData, SocialResultsData } from './types';
import type { ClientOption } from '@/components/ui/client-picker';

interface SocialResultsEditorProps {
  presentation: PresentationData;
  saving: boolean;
  clients: ClientOption[];
  update: (partial: Partial<PresentationData>) => void;
  onSave: () => Promise<void>;
  onBack: () => void;
}

export function SocialResultsEditor({
  presentation,
  saving,
  update,
  onSave,
  onBack,
}: SocialResultsEditorProps) {
  const data = (presentation.audit_data as unknown as SocialResultsData) ?? {
    instagram_handle: '',
    status: 'idle' as const,
    before: null,
    after: null,
    timeline_months: 3,
    generated_at: null,
  };

  const [handle, setHandle] = useState(data.instagram_handle ?? '');
  const [timelineMonths, setTimelineMonths] = useState(data.timeline_months ?? 3);
  const [generating, setGenerating] = useState(false);
  const [view, setView] = useState<'before' | 'after'>('after');

  const status = data.status;
  const hasBefore = !!data.before;
  const hasAfter = !!data.after;

  async function handleGenerate() {
    if (!handle.trim()) {
      toast.error('Enter an Instagram handle first');
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch(`/api/presentations/${presentation.id}/social-results/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instagram_handle: handle.trim(), timeline_months: timelineMonths }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Generation failed' }));
        throw new Error((err as { error?: string }).error ?? 'Generation failed');
      }

      const result = await res.json() as SocialResultsData;
      update({ audit_data: result as unknown as PresentationData['audit_data'] });
      toast.success('Generated successfully');
      setView('after');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-nativz-border bg-surface px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-pink-500/15 shrink-0">
              <Instagram size={14} className="text-pink-400" />
            </div>
            <span className="text-sm font-semibold text-text-primary truncate">{presentation.title}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saving && <span className="text-xs text-text-muted">Saving…</span>}
          <Button variant="outline" size="sm" onClick={onSave} disabled={saving}>
            <Save size={13} />
            Save
          </Button>
        </div>
      </div>

      <div className="p-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8">
          {/* Left: Controls */}
          <div className="space-y-4">
            {/* Handle + timeline + generate */}
            <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-4">
              <h2 className="text-sm font-semibold text-text-primary">Instagram profile</h2>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-muted">Handle</label>
                <div className="flex items-center gap-2 rounded-lg border border-nativz-border bg-background px-3 py-2 focus-within:border-accent/60 transition-colors">
                  <span className="text-text-muted text-sm select-none">@</span>
                  <input
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value.replace(/^@/, ''))}
                    placeholder="brandhandle"
                    className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-muted">Timeline</label>
                <div className="flex gap-2">
                  {[1, 3, 6, 12].map((m) => (
                    <button
                      key={m}
                      onClick={() => setTimelineMonths(m)}
                      className={`cursor-pointer flex-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
                        timelineMonths === m
                          ? 'border-accent/60 bg-accent-surface text-accent-text'
                          : 'border-nativz-border bg-background text-text-muted hover:bg-surface-hover'
                      }`}
                    >
                      {m}mo
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={generating || !handle.trim()}
                className="w-full"
              >
                {generating ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {status === 'scraping' ? 'Scraping profile…' : 'Generating content…'}
                  </>
                ) : hasAfter ? (
                  <>
                    <RefreshCw size={14} />
                    Regenerate
                  </>
                ) : (
                  <>
                    <Wand2 size={14} />
                    Generate
                  </>
                )}
              </Button>

              {data.error_message && (
                <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-xs text-red-400">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{data.error_message}</span>
                </div>
              )}
            </div>

            {/* Before/After toggle */}
            {(hasBefore || hasAfter) && (
              <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
                <h2 className="text-sm font-semibold text-text-primary">View</h2>
                <div className="flex rounded-lg overflow-hidden border border-nativz-border">
                  <button
                    onClick={() => setView('before')}
                    className={`cursor-pointer flex-1 py-2 text-xs font-semibold transition-colors ${
                      view === 'before'
                        ? 'bg-surface-hover text-text-primary'
                        : 'text-text-muted hover:bg-surface-hover/50'
                    }`}
                  >
                    Current
                  </button>
                  <button
                    onClick={() => setView('after')}
                    className={`cursor-pointer flex-1 py-2 text-xs font-semibold transition-colors ${
                      view === 'after'
                        ? 'bg-accent-surface text-accent-text'
                        : 'text-text-muted hover:bg-surface-hover/50'
                    }`}
                  >
                    After {timelineMonths}mo
                  </button>
                </div>
              </div>
            )}

            {/* Metrics summary */}
            {hasBefore && hasAfter && data.before && data.after && (
              <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
                <h2 className="text-sm font-semibold text-text-primary">Projected growth</h2>
                <div className="space-y-2.5">
                  <MetricRow
                    label="Followers"
                    before={data.before.followers}
                    after={data.after.followers}
                    format={(n) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString()}
                  />
                  <MetricRow
                    label="Posts"
                    before={data.before.posts_count}
                    after={data.after.posts_count}
                    format={(n) => n.toString()}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right: Instagram mockup */}
          <div className="flex flex-col items-center justify-start pt-2">
            {generating && !hasBefore && (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-text-muted">
                <Loader2 size={32} className="animate-spin text-pink-400" />
                <p className="text-sm">{status === 'scraping' ? 'Scraping Instagram profile…' : 'Generating content…'}</p>
              </div>
            )}

            {!generating && !hasBefore && !hasAfter && (
              <div className="flex flex-col items-center justify-center gap-4 py-24">
                <div className="w-16 h-16 rounded-2xl bg-pink-500/10 flex items-center justify-center">
                  <Instagram size={28} className="text-pink-400" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-text-secondary">Enter a handle and click Generate</p>
                  <p className="text-xs text-text-muted max-w-xs">We&apos;ll scrape the profile and generate AI content showing the transformation after {timelineMonths} months with Nativz</p>
                </div>
              </div>
            )}

            {(hasBefore || hasAfter) && (
              <div className="w-full max-w-sm">
                {view === 'before' && data.before && (
                  <InstagramMockup profile={data.before} label="Current" />
                )}
                {view === 'after' && data.after && (
                  <InstagramMockup profile={data.after} label={`After ${timelineMonths} months with Nativz`} />
                )}
                {view === 'after' && !data.after && generating && (
                  <div className="flex flex-col items-center justify-center gap-3 py-24">
                    <Loader2 size={32} className="animate-spin text-pink-400" />
                    <p className="text-sm text-text-muted">Generating after state…</p>
                  </div>
                )}
                {view === 'before' && !data.before && (
                  <div className="flex flex-col items-center justify-center gap-3 py-24 text-text-muted">
                    <p className="text-sm">No before data yet</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Metric row ───────────────────────────────────────────────────────────────

function MetricRow({
  label,
  before,
  after,
  format,
}: {
  label: string;
  before: number;
  after: number;
  format: (n: number) => string;
}) {
  const delta = after - before;
  const pct = before > 0 ? Math.round((delta / before) * 100) : 0;

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-text-secondary">{format(before)}</span>
        <span className="text-text-muted">→</span>
        <span className="font-semibold text-text-primary">{format(after)}</span>
        {pct > 0 && (
          <span className="text-emerald-400 font-medium">+{pct}%</span>
        )}
      </div>
    </div>
  );
}
