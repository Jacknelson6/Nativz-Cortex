'use client';

import { useMemo, useState } from 'react';
import { Loader2, Mail, TestTube2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/lib/utils/format';

export interface ClientOption {
  id: string;
  name: string;
  agency: string | null;
}

export interface UpdateRow {
  id: string;
  title: string;
  body_markdown: string;
  audience_agency: 'nativz' | 'anderson' | null;
  audience_client_id: string | null;
  status: 'draft' | 'sent' | 'failed';
  sent_at: string | null;
  recipient_count: number;
  failure_reason: string | null;
  created_at: string;
}

interface Props {
  clients: ClientOption[];
  initialUpdates: UpdateRow[];
  senderEmail: string | null;
}

export function ProductionUpdatesClient({ clients, initialUpdates, senderEmail }: Props) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audienceAgency, setAudienceAgency] = useState<'all' | 'nativz' | 'anderson'>('all');
  const [audienceClientId, setAudienceClientId] = useState<string>('all');
  const [testRecipients, setTestRecipients] = useState(senderEmail ?? '');
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [updates, setUpdates] = useState<UpdateRow[]>(initialUpdates);

  const filteredClients = useMemo(() => {
    if (audienceAgency === 'all') return clients;
    return clients.filter((c) => {
      const a = (c.agency ?? '').toLowerCase();
      if (audienceAgency === 'anderson') return a.includes('anderson') || a === 'ac';
      return !a.includes('anderson') && a !== 'ac';
    });
  }, [clients, audienceAgency]);

  async function submit(opts: { test: boolean }) {
    if (!title.trim() || !body.trim()) {
      toast.error('Title and body are required');
      return;
    }

    const testList = opts.test
      ? testRecipients
          .split(/[,\s]+/)
          .map((x) => x.trim())
          .filter((x) => x.includes('@'))
      : [];

    if (opts.test && testList.length === 0) {
      toast.error('Add at least one test recipient');
      return;
    }

    opts.test ? setTesting(true) : setSending(true);
    try {
      const res = await fetch('/api/production-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body_markdown: body,
          audience_agency: audienceAgency === 'all' ? null : audienceAgency,
          audience_client_id: audienceClientId === 'all' ? null : audienceClientId,
          test_only: opts.test,
          test_recipients: testList,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Send failed');
        return;
      }

      if (opts.test) {
        toast.success(`Test sent — ${data.sent} delivered${data.failed ? `, ${data.failed} failed` : ''}`);
      } else {
        toast.success(`Sent to ${data.sent} portal user${data.sent === 1 ? '' : 's'}`);
        if (data.failed > 0) {
          toast.warning(`${data.failed} email(s) failed — check the history row for details`);
        }
        setTitle('');
        setBody('');
        // Refresh list
        const list = await fetch('/api/production-updates').then((r) => r.json());
        setUpdates(list.updates ?? []);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      opts.test ? setTesting(false) : setSending(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Composer */}
      <section className="rounded-2xl border border-nativz-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-sm font-semibold text-text-primary">Compose update</h2>
        <p className="mt-0.5 text-xs text-text-muted">
          Supports plain text, <code className="text-accent-text">## headings</code>, and <code className="text-accent-text">- bullets</code>.
        </p>

        <div className="mt-4 space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Subject line — e.g. What we shipped this week"
            className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:border-accent focus:outline-none"
            disabled={sending || testing}
          />

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What's new? What shipped? What's coming?"
            rows={10}
            className="w-full resize-y rounded-lg border border-nativz-border bg-background px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-text-muted focus:border-accent focus:outline-none"
            disabled={sending || testing}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-text-secondary">
              Agency
              <select
                value={audienceAgency}
                onChange={(e) => {
                  setAudienceAgency(e.target.value as typeof audienceAgency);
                  setAudienceClientId('all');
                }}
                className="mt-1 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                disabled={sending || testing}
              >
                <option value="all">All agencies</option>
                <option value="nativz">Nativz only</option>
                <option value="anderson">Anderson Collaborative only</option>
              </select>
            </label>

            <label className="text-xs font-medium text-text-secondary">
              Client (optional)
              <select
                value={audienceClientId}
                onChange={(e) => setAudienceClientId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                disabled={sending || testing}
              >
                <option value="all">All clients in this agency</option>
                {filteredClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <details className="rounded-lg border border-nativz-border/60 bg-surface-hover/30 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-text-secondary">
              Test send first (recommended)
            </summary>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={testRecipients}
                onChange={(e) => setTestRecipients(e.target.value)}
                placeholder="you@example.com, other@example.com"
                className="flex-1 rounded-lg border border-nativz-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-text-muted focus:border-accent focus:outline-none"
                disabled={sending || testing}
              />
              <button
                type="button"
                onClick={() => void submit({ test: true })}
                disabled={sending || testing}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-xs font-medium text-text-secondary transition hover:border-accent/35 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {testing ? <Loader2 size={13} className="animate-spin" /> : <TestTube2 size={13} />}
                Send test
              </button>
            </div>
          </details>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-text-muted">
              Agency theming resolves per recipient from their client&apos;s agency.
            </p>
            <button
              type="button"
              onClick={() => void submit({ test: false })}
              disabled={sending || testing || !title.trim() || !body.trim()}
              className="inline-flex items-center gap-2 rounded-lg border border-accent/35 bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              {sending ? 'Sending…' : 'Send to portal users'}
            </button>
          </div>
        </div>
      </section>

      {/* History */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Recent updates</h2>
        {updates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-nativz-border bg-surface/40 px-4 py-8 text-center text-sm text-text-muted">
            No updates sent yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {updates.map((u) => (
              <li
                key={u.id}
                className="rounded-xl border border-nativz-border bg-surface/70 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">{u.title}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {u.audience_agency ? `${u.audience_agency} only` : 'All agencies'}
                      {u.audience_client_id ? ' · single client' : ''}
                      {u.sent_at ? ` · ${formatRelativeTime(u.sent_at)}` : ` · drafted ${formatRelativeTime(u.created_at)}`}
                    </p>
                    {u.failure_reason ? (
                      <p className="mt-1 text-xs text-red-400" title={u.failure_reason}>
                        {u.failure_reason.split('\n')[0]}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    {u.status === 'sent' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                        <CheckCircle2 size={11} /> {u.recipient_count} sent
                      </span>
                    ) : u.status === 'failed' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-400">
                        <AlertTriangle size={11} /> failed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-medium text-text-muted">
                        draft
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
