'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, Link as LinkIcon, Mail, Calendar, X, AlertTriangle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import type { IntakeFlow, IntakeItem, IntakeSegment } from './page';

interface IntakeFormProps {
  token: string;
  flow: IntakeFlow;
}

const SOCIAL_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  youtube: 'YouTube',
};

export function IntakeForm({ token, flow: initialFlow }: IntakeFormProps) {
  const [flow, setFlow] = useState(initialFlow);

  const allItems = useMemo(
    () => flow.segments.flatMap((s) => s.groups.flatMap((g) => g.items)),
    [flow],
  );
  const required = allItems.filter((i) => i.required && i.owner === 'client');
  const requiredDone = required.filter((i) => i.status === 'done').length;
  const progressPct = required.length === 0 ? 100 : Math.round((requiredDone / required.length) * 100);

  function patchItemLocally(itemId: string, patch: Partial<IntakeItem>) {
    setFlow((prev) => ({
      ...prev,
      segments: prev.segments.map((seg) => ({
        ...seg,
        groups: seg.groups.map((grp) => ({
          ...grp,
          items: grp.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
        })),
      })),
    }));
  }

  async function patchItem(itemId: string, patch: { status?: 'pending' | 'done'; data?: Record<string, unknown>; dont_have?: boolean }): Promise<boolean> {
    const res = await fetch(`/api/onboard/${encodeURIComponent(token)}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? 'Save failed');
      return false;
    }
    const json = await res.json();
    if (json.flow_status && json.flow_status !== flow.status) {
      setFlow((prev) => ({ ...prev, status: json.flow_status }));
    }
    return true;
  }

  const agencyLabel = flow.client.agency === 'anderson' ? 'Anderson Collaborative' : 'Nativz';

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <header className="border-b border-nativz-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-6 px-6 py-5">
          <div className="flex items-center gap-3">
            {flow.client.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={flow.client.logo_url} alt={flow.client.name} className="h-9 w-9 rounded-md object-cover" />
            ) : (
              <div className="grid h-9 w-9 place-items-center rounded-md bg-accent-surface text-sm font-bold text-accent-text">
                {flow.client.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold leading-tight">{flow.client.name}</p>
              <p className="text-xs text-text-muted">{agencyLabel} onboarding</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-text-muted">{requiredDone} of {required.length} required</p>
            <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-surface-hover">
              <div className="h-full rounded-full bg-accent-text transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 space-y-10">
        <FlowStatusBanner status={flow.status} />

        {flow.segments.length === 0 ? (
          <div className="rounded-xl border border-nativz-border bg-surface p-8 text-center">
            <p className="text-sm text-text-muted">Your onboarding is being set up. Refresh this page in a few minutes.</p>
          </div>
        ) : (
          flow.segments.map((segment) => (
            <SegmentSection key={segment.id} segment={segment} token={token} onItemPatch={patchItem} onItemUpdate={patchItemLocally} />
          ))
        )}

        <footer className="pt-6 text-center text-xs text-text-muted">
          Need help? Reply to the email this link came from, or write{' '}
          <a className="text-accent-text hover:underline" href={`mailto:${flow.client.agency === 'anderson' ? 'jack@andersoncollaborative.com' : 'jack@nativz.io'}`}>
            {flow.client.agency === 'anderson' ? 'jack@andersoncollaborative.com' : 'jack@nativz.io'}
          </a>
          .
        </footer>
      </main>
    </div>
  );
}

function FlowStatusBanner({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-300">
        <Check size={18} />
        <p className="text-sm">All set — your team has everything they need.</p>
      </div>
    );
  }
  if (status === 'paused') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-yellow-300">
        <AlertTriangle size={18} />
        <p className="text-sm">Onboarding is paused. We'll be in touch.</p>
      </div>
    );
  }
  if (status === 'awaiting_payment') {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface p-4">
        <p className="text-sm font-semibold">Payment processing.</p>
        <p className="mt-1 text-xs text-text-muted">
          You can fill in everything below now. We'll start as soon as your first payment clears.
        </p>
      </div>
    );
  }
  if (status === 'needs_proposal') {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface p-4">
        <p className="text-sm">Awaiting agreement signature.</p>
      </div>
    );
  }
  return null;
}

function SegmentSection({
  segment,
  token,
  onItemPatch,
  onItemUpdate,
}: {
  segment: IntakeSegment;
  token: string;
  onItemPatch: (itemId: string, patch: { status?: 'pending' | 'done'; data?: Record<string, unknown>; dont_have?: boolean }) => Promise<boolean>;
  onItemUpdate: (itemId: string, patch: Partial<IntakeItem>) => void;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">{segment.title}</h2>
      <div className="space-y-6">
        {segment.groups.map((group) => (
          <div key={group.id} className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">{group.name}</h3>
            <div className="divide-y divide-nativz-border overflow-hidden rounded-xl border border-nativz-border bg-surface">
              {group.items.map((item) => (
                <ItemRow key={item.id} item={item} token={token} onPatch={onItemPatch} onLocalUpdate={onItemUpdate} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ItemRow({
  item,
  token,
  onPatch,
  onLocalUpdate,
}: {
  item: IntakeItem;
  token: string;
  onPatch: (itemId: string, patch: { status?: 'pending' | 'done'; data?: Record<string, unknown>; dont_have?: boolean }) => Promise<boolean>;
  onLocalUpdate: (itemId: string, patch: Partial<IntakeItem>) => void;
}) {
  // Agency-owned items render read-only ("we're handling this")
  if (item.owner === 'agency' || item.kind === 'agency_followup') {
    return <AgencyItem item={item} />;
  }

  const labelClass = item.status === 'done' ? 'text-text-secondary line-through' : 'text-text-primary';

  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className={`text-sm font-medium ${labelClass}`}>{item.task}</p>
          {item.required ? <span className="text-[10px] font-semibold uppercase tracking-wide text-red-400">Required</span> : null}
        </div>
        {item.description ? (
          <p className="mt-1 text-xs text-text-muted">{item.description}</p>
        ) : null}
        <ItemEditor item={item} token={token} onPatch={onPatch} onLocalUpdate={onLocalUpdate} />
      </div>
      <ItemStatusBadge item={item} />
    </div>
  );
}

function ItemStatusBadge({ item }: { item: IntakeItem }) {
  if (item.dont_have) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2 py-1 text-[10px] font-medium text-text-muted">
        Team handling
      </span>
    );
  }
  if (item.status === 'done') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
        <Check size={10} /> Done
      </span>
    );
  }
  return null;
}

function AgencyItem({ item }: { item: IntakeItem }) {
  return (
    <div className="flex items-start gap-3 bg-surface-hover/40 px-4 py-4">
      <Loader2 size={14} className="mt-0.5 animate-spin text-text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-secondary">{item.task}</p>
        {item.description ? <p className="mt-1 text-xs text-text-muted">{item.description}</p> : null}
        <p className="mt-1 text-xs text-text-muted">Your team is handling this.</p>
      </div>
    </div>
  );
}

function ItemEditor({
  item,
  token,
  onPatch,
  onLocalUpdate,
}: {
  item: IntakeItem;
  token: string;
  onPatch: (itemId: string, patch: { status?: 'pending' | 'done'; data?: Record<string, unknown>; dont_have?: boolean }) => Promise<boolean>;
  onLocalUpdate: (itemId: string, patch: Partial<IntakeItem>) => void;
}) {
  const editorProps: EditorProps = { item, token, onPatch, onLocalUpdate };
  switch (item.kind) {
    case 'drive_link':
      return <DriveLinkEditor {...editorProps} />;
    case 'email_list':
      return <EmailListEditor {...editorProps} />;
    case 'oauth_socials':
      return <OAuthSocialsEditor {...editorProps} />;
    case 'schedule_meeting':
      return <ScheduleMeetingEditor {...editorProps} />;
    case 'text_response':
      return <TextResponseEditor {...editorProps} />;
    case 'simple_check':
    default:
      return <SimpleCheckEditor {...editorProps} />;
  }
}

function DriveLinkEditor({ item, onPatch, onLocalUpdate }: EditorProps) {
  const initialUrl = typeof item.data.url === 'string' ? item.data.url : '';
  const [url, setUrl] = useState(initialUrl);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!url.trim() || url === initialUrl) return;
    setSaving(true);
    const data = { url: url.trim() };
    const ok = await onPatch(item.id, { data, status: 'done' });
    if (ok) {
      onLocalUpdate(item.id, { data, status: 'done' });
      toast.success('Saved');
    }
    setSaving(false);
  }

  async function clear() {
    setSaving(true);
    const ok = await onPatch(item.id, { data: {}, status: 'pending' });
    if (ok) {
      onLocalUpdate(item.id, { data: {}, status: 'pending' });
      setUrl('');
    }
    setSaving(false);
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <div className="relative flex-1">
        <LinkIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={save}
          placeholder="Paste a Drive, Dropbox, or other shareable URL"
          className="w-full rounded-md border border-nativz-border bg-background py-2 pl-9 pr-3 text-sm focus:border-accent-text focus:outline-none"
          disabled={saving}
        />
      </div>
      {item.status === 'done' ? (
        <button type="button" onClick={clear} className="rounded-md border border-nativz-border px-2 py-2 text-text-muted transition hover:text-text-primary" title="Clear">
          <X size={14} />
        </button>
      ) : (
        <button
          type="button"
          onClick={save}
          disabled={saving || !url.trim()}
          className="rounded-md bg-accent-text px-3 py-2 text-xs font-semibold text-background transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
        </button>
      )}
    </div>
  );
}

function EmailListEditor({ item, onPatch, onLocalUpdate }: EditorProps) {
  const initialEmails = Array.isArray(item.data.emails) ? (item.data.emails as string[]) : [];
  const [emails, setEmails] = useState<string[]>(initialEmails);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  async function commit(next: string[]) {
    setSaving(true);
    const data = { ...item.data, emails: next };
    const status = next.length > 0 ? 'done' : 'pending';
    const ok = await onPatch(item.id, { data, status });
    if (ok) onLocalUpdate(item.id, { data, status });
    setSaving(false);
  }

  function addEmail() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('Enter a valid email');
      return;
    }
    if (emails.includes(trimmed)) {
      setDraft('');
      return;
    }
    const next = [...emails, trimmed];
    setEmails(next);
    setDraft('');
    void commit(next);
  }

  async function remove(email: string) {
    const next = emails.filter((e) => e !== email);
    setEmails(next);
    await commit(next);
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {emails.map((email) => (
          <span key={email} className="inline-flex items-center gap-1.5 rounded-full bg-accent-surface px-3 py-1 text-xs text-accent-text">
            <Mail size={11} />
            {email}
            <button type="button" onClick={() => remove(email)} className="text-accent-text/70 hover:text-accent-text">
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addEmail();
            }
          }}
          placeholder="teammate@example.com"
          className="flex-1 rounded-md border border-nativz-border bg-background px-3 py-2 text-sm focus:border-accent-text focus:outline-none"
        />
        <button
          type="button"
          onClick={addEmail}
          disabled={saving || !draft.trim()}
          className="rounded-md border border-nativz-border px-3 py-2 text-xs font-semibold text-text-primary transition hover:bg-surface-hover disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function OAuthSocialsEditor({ item, token, onPatch, onLocalUpdate }: EditorProps) {
  const platform = (item.data.platform as string) ?? '';
  const platformLabel = SOCIAL_LABEL[platform] ?? platform ?? 'this platform';
  const connectedAt = typeof item.data.connected_at === 'string' ? (item.data.connected_at as string) : null;
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);

  async function toggleDontHave() {
    setSaving(true);
    const next = !item.dont_have;
    const ok = await onPatch(item.id, {
      dont_have: next,
      status: next ? 'done' : 'pending',
      data: next ? { ...item.data, connected_at: null, social_profile_id: null } : item.data,
    });
    if (ok) {
      onLocalUpdate(item.id, {
        dont_have: next,
        status: next ? 'done' : 'pending',
        data: next ? { ...item.data, connected_at: null, social_profile_id: null } : item.data,
      });
      toast.success(next ? `${platformLabel}: team will create it` : `${platformLabel} unlocked`);
    }
    setSaving(false);
  }

  async function startConnect() {
    if (!platform) {
      toast.error('Platform not set on this item.');
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch(`/api/onboard/${encodeURIComponent(token)}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, itemId: item.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.authUrl) {
        toast.error(json.error ?? `Could not start ${platformLabel} connect.`);
        return;
      }
      window.location.href = json.authUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
    } finally {
      setConnecting(false);
    }
  }

  if (item.dont_have) {
    return (
      <div className="mt-3 space-y-2">
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
          <p className="text-xs text-yellow-300">Your team will create + connect this {platformLabel} account on your behalf.</p>
        </div>
        <button
          type="button"
          onClick={toggleDontHave}
          disabled={saving}
          className="text-xs text-text-muted underline-offset-2 hover:underline"
        >
          Actually, I do have one — let me connect it
        </button>
      </div>
    );
  }

  if (connectedAt) {
    return (
      <div className="mt-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
          <Check size={11} />
          {platformLabel} connected
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={startConnect}
        disabled={connecting}
        className="inline-flex items-center gap-2 rounded-md bg-accent-text px-3 py-2 text-xs font-semibold text-background transition hover:opacity-90 disabled:opacity-60"
      >
        {connecting ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
        {connecting ? 'Opening…' : `Connect ${platformLabel}`}
      </button>
      <button
        type="button"
        onClick={toggleDontHave}
        disabled={saving}
        className="text-xs text-text-muted underline-offset-2 hover:underline disabled:opacity-50"
      >
        We don't have one
      </button>
    </div>
  );
}

function ScheduleMeetingEditor({ item, onPatch, onLocalUpdate }: EditorProps) {
  const teamScheduling = item.scheduling ?? null;
  const externalUrl =
    typeof item.data.scheduling_url === 'string' ? (item.data.scheduling_url as string) : null;
  const [saving, setSaving] = useState(false);

  async function markScheduled() {
    setSaving(true);
    const data = { ...item.data, scheduled_at: new Date().toISOString() };
    const ok = await onPatch(item.id, { data, status: 'done' });
    if (ok) onLocalUpdate(item.id, { data, status: 'done' });
    setSaving(false);
  }

  // Linked team-availability event — show its current state inline.
  if (teamScheduling) {
    if (teamScheduling.status === 'scheduled' && teamScheduling.pick) {
      const picked = new Date(teamScheduling.pick.start_at);
      const formatted = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(picked);
      return (
        <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          <Check size={12} />
          Confirmed for {formatted}
        </div>
      );
    }
    if (teamScheduling.status === 'open') {
      return (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={`/schedule/${teamScheduling.share_token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-accent-text px-3 py-2 text-xs font-semibold text-background transition hover:opacity-90"
          >
            <Calendar size={12} />
            Pick a time ({teamScheduling.duration_minutes} min)
          </a>
          <span className="text-xs text-text-muted">Times the whole team is free.</span>
        </div>
      );
    }
    return (
      <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-nativz-border px-3 py-2 text-xs text-text-muted">
        Scheduling on hold — your team will reach out.
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {externalUrl ? (
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-accent-text px-3 py-2 text-xs font-semibold text-background transition hover:opacity-90"
        >
          <Calendar size={12} />
          Pick a time
        </a>
      ) : (
        <span className="text-xs text-text-muted">Your team will email you a scheduling link.</span>
      )}
      {item.status !== 'done' ? (
        <button
          type="button"
          onClick={markScheduled}
          disabled={saving}
          className="rounded-md border border-nativz-border px-3 py-2 text-xs text-text-primary transition hover:bg-surface-hover disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : 'I scheduled it'}
        </button>
      ) : null}
    </div>
  );
}

function TextResponseEditor({ item, onPatch, onLocalUpdate }: EditorProps) {
  const initialValue = typeof item.data.value === 'string' ? (item.data.value as string) : '';
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (value === initialValue) return;
    setSaving(true);
    const data = { ...item.data, value };
    const status = value.trim().length > 0 ? 'done' : 'pending';
    const ok = await onPatch(item.id, { data, status });
    if (ok) onLocalUpdate(item.id, { data, status });
    setSaving(false);
  }

  return (
    <div className="mt-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        rows={3}
        className="w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm focus:border-accent-text focus:outline-none"
        disabled={saving}
      />
    </div>
  );
}

function SimpleCheckEditor({ item, onPatch, onLocalUpdate }: EditorProps) {
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    const next = item.status === 'done' ? 'pending' : 'done';
    const ok = await onPatch(item.id, { status: next });
    if (ok) onLocalUpdate(item.id, { status: next });
    setSaving(false);
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition ${
          item.status === 'done'
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
            : 'border-nativz-border text-text-primary hover:bg-surface-hover'
        } disabled:opacity-50`}
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : item.status === 'done' ? <Check size={12} /> : null}
        {item.status === 'done' ? 'Done' : 'Mark complete'}
      </button>
    </div>
  );
}

type EditorProps = {
  item: IntakeItem;
  token: string;
  onPatch: (itemId: string, patch: { status?: 'pending' | 'done'; data?: Record<string, unknown>; dont_have?: boolean }) => Promise<boolean>;
  onLocalUpdate: (itemId: string, patch: Partial<IntakeItem>) => void;
};
