'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock,
  Eye,
  FileEdit,
  Mail,
  MessageSquare,
  Search,
  Send,
  UserX,
  XCircle,
} from 'lucide-react';
import { EmailHubSkeletonRows } from './_loading';

type Stats = {
  draft: number;
  scheduled: number;
  sent: number;
  delivered: number;
  opened: number;
  replied: number;
  unsubscribed: number;
  bounced: number;
  failed: number;
  totalSent: number;
  openRate: number;
  replyRate: number;
  bounceRate: number;
};

type MessageRow = {
  id: string;
  campaign_id: string | null;
  contact_id: string | null;
  recipient_email: string;
  agency: 'nativz' | 'anderson' | null;
  from_address: string | null;
  subject: string;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  open_count: number;
  replied_at: string | null;
  bounced_at: string | null;
  failure_reason: string | null;
  created_at: string;
  campaign: { id: string; name: string } | null;
  contact: { id: string; email: string; full_name: string | null } | null;
};

type StatusFilter =
  | 'all'
  | 'draft'
  | 'scheduled'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'replied'
  | 'bounced'
  | 'failed'
  | 'complained';

type ReplyFilter = 'all' | 'yes' | 'no';

const EMPTY_STATS: Stats = {
  draft: 0,
  scheduled: 0,
  sent: 0,
  delivered: 0,
  opened: 0,
  replied: 0,
  unsubscribed: 0,
  bounced: 0,
  failed: 0,
  totalSent: 0,
  openRate: 0,
  replyRate: 0,
  bounceRate: 0,
};

export function EmailsTab() {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [replies, setReplies] = useState<ReplyFilter>('all');
  const [domain, setDomain] = useState('');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');

  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  if (replies !== 'all') params.set('replies', replies);
  if (domain.trim()) params.set('domain', domain.trim());
  if (campaignFilter !== 'all') params.set('campaign', campaignFilter);

  const { data, isLoading } = useSWR<{ messages: MessageRow[]; stats: Stats }>(
    `/api/admin/email-hub/messages?${params.toString()}`,
  );
  const messages = useMemo(() => data?.messages ?? [], [data]);
  const stats = data?.stats ?? EMPTY_STATS;

  const campaigns = useMemo(() => {
    const seen = new Map<string, string>();
    for (const m of messages) {
      if (m.campaign) seen.set(m.campaign.id, m.campaign.name);
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [messages]);

  return (
    <div className="space-y-5">
      <StatsGrid stats={stats} />
      <RatesGrid stats={stats} />

      <section className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-nativz-border">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-surface border border-nativz-border">
              <Mail size={15} className="text-accent-text" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">All emails</h2>
              <p className="text-xs text-text-muted mt-0.5">
                {messages.length} email{messages.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-nativz-border bg-surface/40">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="Filter by domain…"
              className="w-full rounded-full border border-nativz-border bg-background px-9 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-text-muted">Replies:</span>
            <SegmentedButton
              active={replies === 'all'}
              onClick={() => setReplies('all')}
              label="All"
            />
            <SegmentedButton
              active={replies === 'yes'}
              onClick={() => setReplies('yes')}
              label="Yes"
            />
            <SegmentedButton
              active={replies === 'no'}
              onClick={() => setReplies('no')}
              label="No"
            />
          </div>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="rounded-full border border-nativz-border bg-background px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="opened">Opened</option>
            <option value="replied">Replied</option>
            <option value="bounced">Bounced</option>
            <option value="failed">Failed</option>
            <option value="complained">Unsubscribed</option>
          </select>

          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="rounded-full border border-nativz-border bg-background px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="all">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <MessageList messages={messages} loading={isLoading} />
      </section>
    </div>
  );
}

function SegmentedButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
        active
          ? 'bg-accent text-white'
          : 'bg-transparent text-text-muted hover:text-text-secondary'
      }`}
    >
      {label}
    </button>
  );
}

function StatsGrid({ stats }: { stats: Stats }) {
  const cards: { label: string; value: number; icon: typeof Mail; color: string }[] = [
    { label: 'Draft', value: stats.draft, icon: FileEdit, color: 'text-text-secondary' },
    { label: 'Scheduled', value: stats.scheduled, icon: Clock, color: 'text-text-secondary' },
    { label: 'Sent', value: stats.sent + stats.delivered, icon: Send, color: 'text-blue-500' },
    { label: 'Opened', value: stats.opened, icon: Eye, color: 'text-sky-500' },
    { label: 'Replied', value: stats.replied, icon: MessageSquare, color: 'text-emerald-500' },
    { label: 'Unsubscribed', value: stats.unsubscribed, icon: UserX, color: 'text-amber-500' },
    { label: 'Bounced', value: stats.bounced, icon: Ban, color: 'text-rose-500' },
    { label: 'Failed', value: stats.failed, icon: AlertCircle, color: 'text-rose-500' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-xl border border-nativz-border bg-surface px-3 py-3 text-center"
          >
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Icon size={13} className={card.color} />
              <span className={`text-lg font-bold ${card.color}`}>{card.value}</span>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {card.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function RatesGrid({ stats }: { stats: Stats }) {
  const rates: { label: string; value: string; icon: typeof Send; tone: string }[] = [
    {
      label: 'Total sent',
      value: `${stats.totalSent}`,
      icon: Send,
      tone: 'bg-surface text-text-primary',
    },
    {
      label: 'Open rate',
      value: `${stats.openRate.toFixed(1)}%`,
      icon: Eye,
      tone: 'bg-sky-500/[0.08] text-sky-500',
    },
    {
      label: 'Reply rate',
      value: `${stats.replyRate.toFixed(1)}%`,
      icon: MessageSquare,
      tone: 'bg-emerald-500/[0.08] text-emerald-500',
    },
    {
      label: 'Bounce rate',
      value: `${stats.bounceRate.toFixed(1)}%`,
      icon: XCircle,
      tone: 'bg-amber-500/[0.08] text-amber-500',
    },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {rates.map((r) => {
        const Icon = r.icon;
        return (
          <div
            key={r.label}
            className={`rounded-xl border border-nativz-border ${r.tone} px-5 py-5`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon size={16} />
              <p className="text-2xl font-bold">{r.value}</p>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
              {r.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function MessageList({ messages, loading }: { messages: MessageRow[]; loading: boolean }) {
  if (loading && messages.length === 0) {
    return <EmailHubSkeletonRows count={6} />;
  }
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-surface border border-nativz-border">
          <Mail size={22} className="text-accent-text" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-text-primary">No emails yet</h3>
          <p className="mt-1 max-w-md text-sm text-text-muted">
            Start by creating a campaign or sending outreach emails. All your sent emails
            will appear here.
          </p>
        </div>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-nativz-border">
      {messages.map((m) => (
        <li key={m.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-surface/40">
          <StatusDot status={m.status} replied={Boolean(m.replied_at)} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-primary truncate">{m.subject}</p>
            <p className="text-xs text-text-muted truncate">
              {m.contact?.full_name ? `${m.contact.full_name} • ` : ''}
              {m.recipient_email}
              {m.campaign?.name ? ` • ${m.campaign.name}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted shrink-0">
            {m.open_count > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Eye size={12} /> {m.open_count}
              </span>
            ) : null}
            {m.replied_at ? (
              <span className="inline-flex items-center gap-1 text-emerald-500">
                <MessageSquare size={12} /> replied
              </span>
            ) : null}
            {m.bounced_at ? (
              <span className="inline-flex items-center gap-1 text-rose-500">
                <Ban size={12} /> bounced
              </span>
            ) : null}
            <time className="tabular-nums">{formatRel(m.sent_at ?? m.created_at)}</time>
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusDot({ status, replied }: { status: string; replied: boolean }) {
  if (replied) {
    return <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />;
  }
  if (status === 'bounced' || status === 'failed' || status === 'complained') {
    return <XCircle size={16} className="text-rose-500 shrink-0" />;
  }
  if (status === 'delivered' || status === 'sent') {
    return <Send size={16} className="text-blue-500 shrink-0" />;
  }
  if (status === 'scheduled') {
    return <Clock size={16} className="text-text-secondary shrink-0" />;
  }
  return <FileEdit size={16} className="text-text-muted shrink-0" />;
}

function formatRel(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  const delta = Date.now() - t;
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  if (delta < 2_592_000_000) return `${Math.floor(delta / 86_400_000)}d`;
  return new Date(iso).toLocaleDateString();
}
