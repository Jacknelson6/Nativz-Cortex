'use client';

import { useEffect, useState } from 'react';
import { Loader2, ExternalLink, Check, FileText, Film, Megaphone } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ServiceKind } from '@/lib/clients/service-defaults';

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  service: ServiceKind;
  periodId: string;
}

interface ReviewRow {
  id: string;
  client_id: string;
  service: string;
  period_id: string;
  decision: 'noted' | 'top_up_opened';
  decided_by: string | null;
  decided_at: string;
  notes: string | null;
}

interface OverScopeRow {
  id: string;
  approvedAt: string;
  editorName: string;
  index: number;
}

const SERVICE_META: Record<ServiceKind, { label: string; icon: typeof Film }> = {
  editing: { label: 'editing', icon: Film },
  smm: { label: 'social media', icon: Megaphone },
  blogging: { label: 'blogging', icon: FileText },
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function OverageReviewDialog({
  open,
  onClose,
  clientId,
  service,
  periodId,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewRow | null>(null);
  const [rows, setRows] = useState<OverScopeRow[]>([]);
  const meta = SERVICE_META[service];
  const Icon = meta.icon;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
          client_id: clientId,
          service,
          period_id: periodId,
          include_details: '1',
        });
        const res = await fetch(`/api/deliverables/overage-reviews?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `Failed (${res.status})`);
        }
        const json = (await res.json()) as { review: ReviewRow | null; rows: OverScopeRow[] };
        if (!cancelled) {
          setReview(json.review);
          setRows(json.rows ?? []);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open, clientId, service, periodId]);

  async function recordDecision(decision: 'noted' | 'top_up_opened') {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/deliverables/overage-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          service,
          period_id: periodId,
          decision,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Failed (${res.status})`);
      }
      const json = (await res.json()) as { review: ReviewRow };
      setReview(json.review);
      if (decision === 'top_up_opened') {
        // Open the existing top-up admin flow in a new tab. Path stays the
        // existing /admin/deliverables flow per the credits-pivot project memo.
        window.open(`/admin/clients`, '_blank', 'noopener');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Out of scope this period — ${meta.label}`}
      maxWidth="lg"
    >
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 size={14} className="animate-spin" />
            Loading over-scope deliverables…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : (
          <>
            <p className="text-sm text-text-secondary">
              {rows.length === 0
                ? 'No deliverables found in this calendar month yet. The over-scope flag may have cleared since the page loaded.'
                : `Showing all ${rows.length} approved ${meta.label} deliverable${rows.length === 1 ? '' : 's'} this calendar month. Rows past the contracted capacity are over scope.`}
            </p>

            {rows.length > 0 && (
              <div className="rounded-xl border border-nativz-border bg-background/40">
                <div className="grid grid-cols-[40px_1fr_120px_140px] gap-2 border-b border-nativz-border px-3 py-2 text-[11px] uppercase tracking-wide text-text-muted">
                  <span>#</span>
                  <span>Editor</span>
                  <span>Approved</span>
                  <span></span>
                </div>
                <div className="divide-y divide-nativz-border">
                  {rows.map((row) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-[40px_1fr_120px_140px] items-center gap-2 px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-xs text-text-muted">{row.index}</span>
                      <span className="flex items-center gap-2 text-text-primary">
                        <Icon size={12} className="text-text-muted" />
                        {row.editorName}
                      </span>
                      <span className="text-xs text-text-muted">{formatTimestamp(row.approvedAt)}</span>
                      <span className="text-right text-[11px]" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {review ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                <Check size={14} className="mt-0.5 shrink-0" />
                <span>
                  Decision recorded: {review.decision === 'noted' ? 'noted, will handle' : 'opened a credit pack'}{' '}
                  on {formatTimestamp(review.decided_at)}.
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => recordDecision('noted')}
                  disabled={saving}
                >
                  Noted, will handle
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => recordDecision('top_up_opened')}
                  disabled={saving}
                >
                  <ExternalLink size={12} />
                  Open a credit pack
                </Button>
                <span className="text-[11px] text-text-muted">
                  Either choice closes this prompt for this period.
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
