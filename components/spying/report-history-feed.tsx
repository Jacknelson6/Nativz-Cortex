'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileText, Send } from 'lucide-react';

type ClientEmbed = { name: string; agency: string | null } | { name: string; agency: string | null }[] | null;

interface ReportRow {
  id: string;
  subscription_id: string;
  client_id: string;
  generated_at: string;
  period_start: string;
  period_end: string;
  email_status: 'pending' | 'sent' | 'failed';
  email_error: string | null;
  client: ClientEmbed;
}

function resolveClient(c: ClientEmbed): { name: string; agency: string | null } | null {
  if (!c) return null;
  if (Array.isArray(c)) return c[0] ?? null;
  return c;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ReportHistoryFeed({ reports }: { reports: ReportRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerHtml, setViewerHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function resend(id: string) {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/competitor-reports/${id}/resend`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? 'Resend failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resend failed');
    } finally {
      setPendingId(null);
      startTransition(() => router.refresh());
    }
  }

  async function view(id: string) {
    if (viewerId === id) {
      setViewerId(null);
      setViewerHtml(null);
      return;
    }
    setViewerId(id);
    setViewerHtml(null);
    try {
      const res = await fetch(`/api/competitor-reports/${id}`);
      const body = await res.json();
      setViewerHtml(body?.report?.report_html ?? '<p>No HTML stored.</p>');
    } catch (err) {
      setViewerHtml(`<pre>${err instanceof Error ? err.message : 'load failed'}</pre>`);
    }
  }

  if (reports.length === 0) {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface p-8 text-center text-sm text-text-muted">
        No reports generated yet. Reports will appear here after the first cron tick or a &quot;Run now&quot; click.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-coral-500/30 bg-coral-500/10 px-4 py-2 text-xs text-coral-300">
          {error}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
        {reports.map((r) => {
          const client = resolveClient(r.client);
          const expanded = viewerId === r.id;
          return (
            <div key={r.id} className="border-b border-nativz-border/60 last:border-b-0">
              <div className="grid grid-cols-[1.2fr_1fr_auto_auto] items-center gap-4 px-4 py-3 text-sm hover:bg-surface-hover/30">
                <div>
                  <div className="truncate text-text-primary">{client?.name ?? '(client deleted)'}</div>
                  <div className="truncate text-[11px] text-text-muted">
                    {shortDate(r.period_start)} → {shortDate(r.period_end)}
                  </div>
                </div>
                <div className="text-[11px] text-text-muted">
                  Generated {shortDate(r.generated_at)}
                </div>
                <StatusBadge status={r.email_status} error={r.email_error} />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => view(r.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-nativz-border/60 bg-surface-hover/30 px-2 py-1 text-[11px] text-text-secondary transition-colors hover:border-accent/30 hover:text-accent-text"
                  >
                    <FileText size={13} />
                    {expanded ? 'Hide' : 'View'}
                  </button>
                  <a
                    href={`/api/competitor-reports/${r.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-nativz-border/60 bg-surface-hover/30 px-2 py-1 text-[11px] text-text-secondary transition-colors hover:border-accent/30 hover:text-accent-text"
                  >
                    <Download size={13} />
                    PDF
                  </a>
                  <button
                    type="button"
                    disabled={pendingId === r.id}
                    onClick={() => resend(r.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-nativz-border/60 bg-surface-hover/30 px-2 py-1 text-[11px] text-text-secondary transition-colors hover:border-accent/30 hover:text-accent-text disabled:opacity-40"
                  >
                    <Send size={13} />
                    Resend
                  </button>
                </div>
              </div>
              {expanded && (
                <div className="border-t border-nativz-border/60 bg-nativz-ink-2/60 p-4">
                  {viewerHtml == null ? (
                    <p className="text-xs text-text-muted">Loading…</p>
                  ) : (
                    <iframe
                      className="h-[520px] w-full rounded-lg border border-nativz-border/40 bg-white"
                      srcDoc={viewerHtml}
                      sandbox=""
                      title="Competitor report preview"
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status, error }: { status: string; error: string | null }) {
  const tone =
    status === 'sent'
      ? 'border-accent/30 bg-accent/10 text-accent-text'
      : status === 'failed'
        ? 'border-coral-500/30 bg-coral-500/10 text-coral-300'
        : 'border-text-muted/30 bg-surface-hover/60 text-text-secondary';
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}
      title={error ?? undefined}
    >
      {status}
    </span>
  );
}
