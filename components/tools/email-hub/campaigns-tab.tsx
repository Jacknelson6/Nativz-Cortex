'use client';

import { useEffect, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Megaphone,
  Plus,
  Send,
} from 'lucide-react';
import { LabeledInput, ModalShell } from './contacts-tab';

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
  scheduled_for: string | null;
  sent_at: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  agency: 'nativz' | 'anderson' | null;
  created_at: string;
  client: { id: string; name: string; agency: string | null } | null;
  list: { id: string; name: string } | null;
};

type Template = {
  id: string;
  name: string;
  subject: string;
  body_markdown: string;
};

type EmailList = { id: string; name: string };
type ClientRow = { id: string; name: string; agency: string | null };

interface Props {
  clients: ClientRow[];
}

export function CampaignsTab({ clients }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/email-hub/campaigns');
    const json = await res.json();
    setCampaigns((json.campaigns ?? []) as Campaign[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-nativz-border">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-surface border border-nativz-border">
            <Megaphone size={15} className="text-accent-text" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text-primary">Campaigns</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {campaigns.length} campaign{campaigns.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90"
        >
          <Plus size={13} />
          New campaign
        </button>
      </header>

      {loading ? (
        <div className="p-12 text-center text-sm text-text-muted">Loading campaigns…</div>
      ) : campaigns.length === 0 ? (
        <EmptyCampaigns onCreate={() => setShowNew(true)} />
      ) : (
        <ul className="divide-y divide-nativz-border">
          {campaigns.map((c) => (
            <CampaignRow key={c.id} campaign={c} />
          ))}
        </ul>
      )}

      {showNew && (
        <NewCampaignModal
          clients={clients}
          onClose={() => setShowNew(false)}
          onSent={() => {
            setShowNew(false);
            load();
          }}
        />
      )}
    </section>
  );
}

function EmptyCampaigns({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-surface border border-nativz-border">
        <Megaphone size={22} className="text-accent-text" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-text-primary">No campaigns yet</h3>
        <p className="mt-1 max-w-md text-sm text-text-muted">
          Create your first campaign to send analytics updates, reports, or announcements
          to your platform users.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
      >
        <Plus size={14} />
        New campaign
      </button>
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const rate =
    campaign.total_recipients > 0
      ? Math.round((campaign.sent_count / campaign.total_recipients) * 100)
      : 0;

  return (
    <li className="px-5 py-3.5 flex items-center gap-3">
      <StatusGlyph status={campaign.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-text-primary truncate">{campaign.name}</p>
          <StatusPill status={campaign.status} />
        </div>
        <p className="text-xs text-text-muted truncate mt-0.5">
          {campaign.subject || 'No subject'} ·{' '}
          {campaign.client?.name ?? (campaign.list?.name ? `List: ${campaign.list.name}` : 'Portal users')}
          {campaign.agency ? ` · ${campaign.agency}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-4 text-xs text-text-muted shrink-0 tabular-nums">
        <span>
          {campaign.sent_count}/{campaign.total_recipients}
          {campaign.total_recipients > 0 ? ` · ${rate}%` : ''}
        </span>
        <time>
          {new Date(campaign.sent_at ?? campaign.scheduled_for ?? campaign.created_at).toLocaleDateString()}
        </time>
      </div>
    </li>
  );
}

function StatusGlyph({ status }: { status: Campaign['status'] }) {
  const tone =
    status === 'sent'
      ? 'text-emerald-500'
      : status === 'failed'
      ? 'text-rose-500'
      : status === 'scheduled'
      ? 'text-sky-500'
      : status === 'sending'
      ? 'text-accent-text'
      : 'text-text-muted';
  const Icon =
    status === 'sent'
      ? CheckCircle2
      : status === 'failed' || status === 'cancelled'
      ? Ban
      : status === 'scheduled'
      ? Clock
      : status === 'sending'
      ? Loader2
      : Mail;
  return (
    <Icon
      size={18}
      className={`${tone} shrink-0 ${status === 'sending' ? 'animate-spin' : ''}`}
    />
  );
}

function StatusPill({ status }: { status: Campaign['status'] }) {
  const map: Record<Campaign['status'], string> = {
    draft: 'bg-surface text-text-muted border-nativz-border',
    scheduled: 'bg-sky-500/10 text-sky-500 border-sky-500/30',
    sending: 'bg-accent/10 text-accent-text border-accent/30',
    sent: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    failed: 'bg-rose-500/10 text-rose-500 border-rose-500/30',
    cancelled: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${map[status]}`}
    >
      {status}
    </span>
  );
}

function NewCampaignModal({
  clients,
  onClose,
  onSent,
}: {
  clients: ClientRow[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [agency, setAgency] = useState<'nativz' | 'anderson' | ''>('');
  const [clientId, setClientId] = useState('');
  const [audienceMode, setAudienceMode] = useState<'list' | 'portal' | 'contacts'>('portal');
  const [listId, setListId] = useState<string>('');
  const [templateId, setTemplateId] = useState<string>('');

  const [lists, setLists] = useState<EmailList[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [scheduleIso, setScheduleIso] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/email-hub/lists')
      .then((r) => (r.ok ? r.json() : { lists: [] }))
      .then((j) => setLists((j.lists ?? []) as EmailList[]))
      .catch(() => setLists([]));
    fetch('/api/admin/email-templates')
      .then((r) => r.json())
      .then((j) => setTemplates((j.templates ?? []) as Template[]))
      .catch(() => setTemplates([]));
  }, []);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      if (!subject) setSubject(tpl.subject);
      if (!body) setBody(tpl.body_markdown);
    }
  }

  async function submit(action: 'draft' | 'send_now' | 'schedule') {
    setBusy(true);
    setError(null);

    const body_payload = {
      name,
      subject,
      body_markdown: body,
      template_id: templateId || null,
      agency: agency || null,
      client_id: clientId || null,
      audience_list_id: audienceMode === 'list' ? listId || null : null,
      audience_portal_only: audienceMode === 'portal',
      audience_contact_ids: [],
      action,
      scheduled_for: action === 'schedule' ? new Date(scheduleIso).toISOString() : null,
    };

    const res = await fetch('/api/admin/email-hub/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body_payload),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setError(json?.error ?? 'Failed to create campaign');
      return;
    }
    onSent();
  }

  const canSubmit = name && subject && body && (audienceMode !== 'list' || listId);

  return (
    <ModalShell title="New campaign" onClose={onClose}>
      <div className="space-y-3">
        <LabeledInput
          label="Name (internal)"
          value={name}
          onChange={setName}
          placeholder="April analytics recap"
          autoFocus
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
              Agency
            </span>
            <select
              value={agency}
              onChange={(e) => setAgency(e.target.value as 'nativz' | 'anderson' | '')}
              className="w-full rounded-xl border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
            >
              <option value="">Auto (from recipient)</option>
              <option value="nativz">Nativz</option>
              <option value="anderson">Anderson Collaborative</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
              Client (optional)
            </span>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-xl border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Audience
          </span>
          <div className="flex gap-2 flex-wrap">
            <AudienceChip
              active={audienceMode === 'portal'}
              onClick={() => setAudienceMode('portal')}
              label="Portal users"
              hint={clientId ? 'scoped to this client' : 'all clients'}
            />
            <AudienceChip
              active={audienceMode === 'list'}
              onClick={() => setAudienceMode('list')}
              label="Contact list"
              hint={lists.length > 0 ? `${lists.length} available` : 'no lists yet'}
            />
          </div>
          {audienceMode === 'list' && (
            <select
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              className="mt-2 w-full rounded-xl border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
            >
              <option value="">Select a list…</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
            Template (optional)
          </span>
          <select
            value={templateId}
            onChange={(e) => applyTemplate(e.target.value)}
            className="w-full rounded-xl border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
          >
            <option value="">Start from scratch</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <LabeledInput
          label="Subject"
          value={subject}
          onChange={setSubject}
          placeholder="Your April analytics recap is ready, {{user.first_name}}"
        />
        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
            Body (markdown)
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder={`Hey {{user.first_name}},\n\nHere is what we're seeing this month…`}
            className="w-full rounded-xl border border-nativz-border bg-background p-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>

        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
            Schedule (optional)
          </span>
          <input
            type="datetime-local"
            value={scheduleIso}
            onChange={(e) => setScheduleIso(e.target.value)}
            className="w-full rounded-xl border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
          />
        </label>

        {error ? <p className="text-xs text-rose-500">{error}</p> : null}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-nativz-border bg-background px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => submit('draft')}
          disabled={busy || !canSubmit}
          className="rounded-full border border-nativz-border bg-background px-4 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          Save draft
        </button>
        {scheduleIso ? (
          <button
            type="button"
            onClick={() => submit('schedule')}
            disabled={busy || !canSubmit}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            <Clock size={12} />
            Schedule send
          </button>
        ) : (
          <button
            type="button"
            onClick={() => submit('send_now')}
            disabled={busy || !canSubmit}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Send size={12} />
            )}
            {busy ? 'Sending…' : 'Send now'}
          </button>
        )}
      </div>
    </ModalShell>
  );
}

function AudienceChip({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left min-w-[140px] ${
        active
          ? 'border-accent bg-accent/[0.06] text-text-primary'
          : 'border-nativz-border bg-background text-text-secondary hover:text-text-primary'
      }`}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-[11px] text-text-muted">{hint}</span>
    </button>
  );
}
