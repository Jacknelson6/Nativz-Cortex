'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  FileEdit,
  Mail,
  MessageSquare,
  MousePointerClick,
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
  clicked: number;
  replied: number;
  unsubscribed: number;
  bounced: number;
  failed: number;
  totalSent: number;
  campaign: number;
  transactional: number;
  system: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
};

type MessageRow = {
  id: string;
  campaign_id: string | null;
  contact_id: string | null;
  recipient_email: string;
  recipient_name: string | null;
  agency: 'nativz' | 'anderson' | null;
  from_address: string | null;
  from_name: string | null;
  reply_to_address: string | null;
  cc: string[] | null;
  bcc: string[] | null;
  subject: string;
  resend_id: string | null;
  status: string;
  category: 'campaign' | 'transactional' | 'system' | null;
  type_key: string | null;
  body_html: string | null;
  client_id: string | null;
  drop_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
  clicked_at: string | null;
  last_clicked_at: string | null;
  click_count: number;
  replied_at: string | null;
  bounced_at: string | null;
  failure_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  campaign: { id: string; name: string } | null;
  contact: { id: string; email: string; full_name: string | null } | null;
  client: { id: string; name: string } | null;
  drop: { id: string; start_date: string; end_date: string } | null;
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

type CategoryFilter = 'all' | 'campaign' | 'transactional' | 'system';

type TypeRow = { typeKey: string; category: string | null; count: number };

const EMPTY_STATS: Stats = {
  draft: 0,
  scheduled: 0,
  sent: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  replied: 0,
  unsubscribed: 0,
  bounced: 0,
  failed: 0,
  totalSent: 0,
  campaign: 0,
  transactional: 0,
  system: 0,
  openRate: 0,
  clickRate: 0,
  replyRate: 0,
  bounceRate: 0,
};

export function EmailsTab() {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [typeKey, setTypeKey] = useState<string>('all');
  const [search, setSearch] = useState('');

  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  if (category !== 'all') params.set('category', category);
  if (typeKey !== 'all') params.set('type', typeKey);
  if (search.trim()) params.set('q', search.trim());

  const { data, error, isLoading, mutate } = useSWR<{
    messages: MessageRow[];
    stats: Stats;
    types: TypeRow[];
  }>(`/api/admin/email-hub/messages?${params.toString()}`);
  const messages = useMemo(() => data?.messages ?? [], [data]);
  const stats = data?.stats ?? EMPTY_STATS;

  // Scope the type dropdown to the active category for clarity.
  const visibleTypes = useMemo(() => {
    const allTypes = data?.types ?? [];
    if (category === 'all') return allTypes;
    return allTypes.filter((t) => t.category === category);
  }, [data, category]);

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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subject or recipient…"
              aria-label="Search by subject or recipient"
              className="w-full rounded-full border border-nativz-border bg-background px-9 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs" role="group" aria-label="Category filter">
            <span className="text-text-muted">Category:</span>
            <SegmentedButton active={category === 'all'} onClick={() => { setCategory('all'); setTypeKey('all'); }} label="All" />
            <SegmentedButton active={category === 'transactional'} onClick={() => { setCategory('transactional'); setTypeKey('all'); }} label="Transactional" />
            <SegmentedButton active={category === 'campaign'} onClick={() => { setCategory('campaign'); setTypeKey('all'); }} label="Campaign" />
            <SegmentedButton active={category === 'system'} onClick={() => { setCategory('system'); setTypeKey('all'); }} label="System" />
          </div>

          <select
            value={typeKey}
            onChange={(e) => setTypeKey(e.target.value)}
            aria-label="Type filter"
            className="rounded-full border border-nativz-border bg-background px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="all">All types</option>
            {visibleTypes.map((t) => (
              <option key={t.typeKey} value={t.typeKey}>
                {humanizeType(t.typeKey)} ({t.count})
              </option>
            ))}
          </select>

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
        { label: 'Clicked', value: stats.clicked, icon: MousePointerClick, tone: 'success' },
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
    { label: 'Click rate', value: `${stats.clickRate.toFixed(1)}%`, icon: MousePointerClick, tone: 'success' },
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
          <h3 className="text-base font-semibold text-text-primary">No emails match</h3>
          <p className="mt-1 max-w-md text-sm text-text-muted">
            Try a different status, category, or search term — every email Cortex sends shows up here.
          </p>
        </div>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-nativz-border">
      {messages.map((m) => (
        <MessageRowItem key={m.id} message={m} />
      ))}
    </ul>
  );
}

function MessageRowItem({ message: m }: { message: MessageRow }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="px-5 py-3.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 text-left hover:bg-surface/40 rounded -mx-2 px-2 py-1"
      >
        {open ? (
          <ChevronDown size={14} className="text-text-muted shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-text-muted shrink-0" />
        )}
        <StatusDot status={m.status} replied={Boolean(m.replied_at)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-text-primary truncate">{m.subject}</p>
            <CategoryPill category={m.category} typeKey={m.type_key} />
          </div>
          <p className="text-xs text-text-muted truncate">
            {m.recipient_name ? `${m.recipient_name} • ` : ''}
            {m.recipient_email}
            {m.client?.name ? ` • ${m.client.name}` : ''}
            {m.campaign?.name ? ` • ${m.campaign.name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted shrink-0">
          {m.open_count > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Eye size={12} /> {m.open_count}
            </span>
          ) : null}
          {m.click_count > 0 ? (
            <span className="inline-flex items-center gap-1 text-emerald-500">
              <MousePointerClick size={12} /> {m.click_count}
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
      </button>
      {open ? <ExpandedMessage message={m} /> : null}
    </li>
  );
}

function CategoryPill({ category, typeKey }: { category: string | null; typeKey: string | null }) {
  if (!category && !typeKey) return null;
  const tone =
    category === 'transactional'
      ? 'bg-accent-surface text-accent-text'
      : category === 'system'
      ? 'bg-amber-500/10 text-amber-400'
      : 'bg-emerald-500/10 text-emerald-400';
  const label = typeKey ? humanizeType(typeKey) : (category ?? '');
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>
      {label}
    </span>
  );
}

function ExpandedMessage({ message: m }: { message: MessageRow }) {
  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-[260px_1fr]">
      <dl className="rounded-xl border border-nativz-border bg-background/40 p-3 text-xs space-y-1.5">
        <Detail label="Status" value={m.status} />
        {m.category ? <Detail label="Category" value={m.category} /> : null}
        {m.type_key ? <Detail label="Type" value={humanizeType(m.type_key)} /> : null}
        {m.from_address ? <Detail label="From" value={m.from_address} /> : null}
        {m.reply_to_address ? <Detail label="Reply-to" value={m.reply_to_address} /> : null}
        <Detail label="To" value={m.recipient_email} />
        {m.cc && m.cc.length > 0 ? <Detail label="CC" value={m.cc.join(', ')} /> : null}
        {m.bcc && m.bcc.length > 0 ? <Detail label="BCC" value={m.bcc.join(', ')} /> : null}
        {m.client?.name ? <Detail label="Client" value={m.client.name} /> : null}
        {m.drop?.id ? <Detail label="Calendar" value={`${m.drop.start_date} → ${m.drop.end_date}`} /> : null}
        {m.sent_at ? <Detail label="Sent" value={new Date(m.sent_at).toLocaleString()} /> : null}
        {m.opened_at ? <Detail label="Opened" value={`${new Date(m.opened_at).toLocaleString()}${m.open_count > 1 ? ` (${m.open_count}×)` : ''}`} /> : null}
        {m.clicked_at ? <Detail label="Clicked" value={`${new Date(m.clicked_at).toLocaleString()}${m.click_count > 1 ? ` (${m.click_count}×)` : ''}`} /> : null}
        {m.bounced_at ? <Detail label="Bounced" value={new Date(m.bounced_at).toLocaleString()} /> : null}
        {m.failure_reason ? <Detail label="Failure" value={m.failure_reason} tone="danger" /> : null}
        {m.resend_id ? <Detail label="Resend ID" value={m.resend_id} mono /> : null}
      </dl>
      <div className="rounded-xl border border-nativz-border bg-background/40 overflow-hidden">
        {m.body_html ? (
          <iframe
            srcDoc={m.body_html}
            sandbox=""
            title={`Preview of ${m.subject}`}
            className="w-full h-[480px] bg-white"
          />
        ) : (
          <div className="px-4 py-12 text-center text-xs text-text-muted">
            No HTML preview captured for this email.
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'danger';
}) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-text-muted">{label}</dt>
      <dd
        className={`min-w-0 flex-1 break-words ${
          mono ? 'font-mono text-[11px]' : ''
        } ${tone === 'danger' ? 'text-rose-400' : 'text-text-primary'}`}
      >
        {value}
      </dd>
    </div>
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

function humanizeType(key: string): string {
  return key
    .split('_')
    .map((p) => (p.length === 0 ? '' : p[0].toUpperCase() + p.slice(1)))
    .join(' ');
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
