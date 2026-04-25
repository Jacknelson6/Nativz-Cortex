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
import { SkeletonRows } from '@/components/ui/loading-skeletons';
import { TONE_SURFACE, TONE_TEXT, type StatusTone } from './_status-tokens';

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

  const { data, error, isLoading, mutate } = useSWR<{ messages: MessageRow[]; stats: Stats }>(
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
      <RatesGrid stats={stats} />
      <StatsClusters stats={stats} />

      <section className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
        <header className="flex items-center justify-end gap-3 px-5 py-3 border-b border-nativz-border">
          <p className="mr-auto text-xs text-text-muted tabular-nums">
            {messages.length} email{messages.length === 1 ? '' : 's'}
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-nativz-border bg-surface/40">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="Filter by domain…"
              aria-label="Filter by recipient domain"
              className="w-full rounded-full border border-nativz-border bg-background px-9 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs" role="group" aria-label="Reply filter">
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
            aria-label="Status filter"
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
            aria-label="Campaign filter"
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

        <MessageList messages={messages} loading={isLoading} error={error} onRetry={() => void mutate()} />
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

/**
 * Three semantic clusters instead of one 8-card grid. Pipeline is the work
 * still in flight; Engagement is positive outcomes; Issues are problems that
 * need attention. Each cluster has its own visual treatment so the eye picks
 * out problems without scanning a uniform monoculture.
 */
function StatsClusters({ stats }: { stats: Stats }) {
  const clusters: { title: string; tone: StatusTone; cards: ClusterCard[] }[] = [
    {
      title: 'Pipeline',
      tone: 'neutral',
      cards: [
        { label: 'Draft', value: stats.draft, icon: FileEdit, tone: 'neutral' },
        { label: 'Scheduled', value: stats.scheduled, icon: Clock, tone: 'neutral' },
        { label: 'Sent', value: stats.sent + stats.delivered, icon: Send, tone: 'progress' },
      ],
    },
    {
      title: 'Engagement',
      tone: 'success',
      cards: [
        { label: 'Opened', value: stats.opened, icon: Eye, tone: 'info' },
        { label: 'Replied', value: stats.replied, icon: MessageSquare, tone: 'success' },
      ],
    },
    {
      title: 'Issues',
      tone: 'danger',
      cards: [
        { label: 'Unsubscribed', value: stats.unsubscribed, icon: UserX, tone: 'warning' },
        { label: 'Bounced', value: stats.bounced, icon: Ban, tone: 'danger' },
        { label: 'Failed', value: stats.failed, icon: AlertCircle, tone: 'danger' },
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {clusters.map((cluster) => (
        <div key={cluster.title} className="rounded-2xl border border-nativz-border bg-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className={`inline-block h-2 w-2 rounded-full ${TONE_TEXT[cluster.tone].replace('text-', 'bg-')}`} aria-hidden />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {cluster.title}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {cluster.cards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="text-center">
                  <div className={`flex items-center justify-center gap-1.5 ${TONE_TEXT[card.tone]}`}>
                    <Icon size={13} aria-hidden />
                    <span className="text-lg font-bold tabular-nums">{card.value}</span>
                  </div>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-text-muted">
                    {card.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ClusterCard {
  label: string;
  value: number;
  icon: typeof Mail;
  tone: StatusTone;
}

function RatesGrid({ stats }: { stats: Stats }) {
  const rates: { label: string; value: string; icon: typeof Send; tone: StatusTone }[] = [
    { label: 'Total sent', value: `${stats.totalSent}`, icon: Send, tone: 'neutral' },
    { label: 'Open rate', value: `${stats.openRate.toFixed(1)}%`, icon: Eye, tone: 'info' },
    { label: 'Reply rate', value: `${stats.replyRate.toFixed(1)}%`, icon: MessageSquare, tone: 'success' },
    { label: 'Bounce rate', value: `${stats.bounceRate.toFixed(1)}%`, icon: XCircle, tone: 'warning' },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {rates.map((r) => {
        const Icon = r.icon;
        return (
          <div key={r.label} className={`rounded-xl border ${TONE_SURFACE[r.tone]} px-5 py-5`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon size={16} aria-hidden />
              <p className="text-2xl font-bold tabular-nums">{r.value}</p>
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

function MessageList({
  messages,
  loading,
  error,
  onRetry,
}: {
  messages: MessageRow[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <p className="text-sm text-rose-500">Couldn&apos;t load emails.</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-nativz-border bg-background px-4 py-2 text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          Retry
        </button>
      </div>
    );
  }
  if (loading && messages.length === 0) {
    return <SkeletonRows count={6} />;
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
