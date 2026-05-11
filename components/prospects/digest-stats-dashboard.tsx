// SPY-10 T27: stats dashboard. Server component. Counts drafts by status +
// derives open/click rates from prospect_digest_events. No charting library
// here, just primitive cards so it loads instantly and matches the rest of
// the admin shell.

import { createAdminClient } from '@/lib/supabase/admin';

interface Props {
  windowDays?: number;
}

type StatusCount = { status: string; count: number };

function pct(num: number, denom: number): string {
  if (denom === 0) return '—';
  return `${Math.round((num / denom) * 100)}%`;
}

export async function DigestStatsDashboard({ windowDays = 30 }: Props) {
  const admin = createAdminClient();
  const since = new Date(Date.now() - windowDays * 24 * 3600 * 1000).toISOString();

  const [draftsRes, eventsRes, subsRes] = await Promise.all([
    admin
      .from('prospect_digest_drafts')
      .select('status')
      .gte('created_at', since),
    admin
      .from('prospect_digest_events')
      .select('kind, draft_id')
      .gte('created_at', since),
    admin
      .from('prospect_digest_subscriptions')
      .select('kind, active'),
  ]);

  const statusCounts = new Map<string, number>();
  for (const row of (draftsRes.data ?? []) as { status: string }[]) {
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  }
  const totalDrafts = (draftsRes.data ?? []).length;
  const sent = statusCounts.get('sent') ?? 0;

  let opened = 0;
  let clicked = 0;
  let unsubscribed = 0;
  const openedDrafts = new Set<string>();
  const clickedDrafts = new Set<string>();
  for (const row of (eventsRes.data ?? []) as { kind: string; draft_id: string }[]) {
    if (row.kind === 'opened') {
      opened += 1;
      openedDrafts.add(row.draft_id);
    } else if (row.kind === 'clicked') {
      clicked += 1;
      clickedDrafts.add(row.draft_id);
    } else if (row.kind === 'unsubscribed') {
      unsubscribed += 1;
    }
  }

  const subs = (subsRes.data ?? []) as { kind: string; active: boolean }[];
  const activeSubs = subs.filter((s) => s.active).length;
  const weeklyActive = subs.filter((s) => s.active && s.kind === 'weekly_competitor').length;
  const monthlyActive = subs.filter((s) => s.active && s.kind === 'monthly_format').length;

  const cards = [
    {
      label: 'Active subscriptions',
      value: activeSubs.toString(),
      sub: `${weeklyActive} weekly · ${monthlyActive} monthly`,
    },
    {
      label: 'Drafts (last ' + windowDays + 'd)',
      value: totalDrafts.toString(),
      sub: `${sent} sent · ${statusCounts.get('drafted') ?? 0} pending`,
    },
    {
      label: 'Unique opens',
      value: openedDrafts.size.toString(),
      sub: `${pct(openedDrafts.size, sent)} open rate · ${opened} total`,
    },
    {
      label: 'Unique clicks',
      value: clickedDrafts.size.toString(),
      sub: `${pct(clickedDrafts.size, sent)} CTR · ${clicked} total`,
    },
    {
      label: 'Unsubscribes',
      value: unsubscribed.toString(),
      sub: `${pct(unsubscribed, sent)} of sent`,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-white/5 bg-surface p-4">
          <div className="text-xs text-white/50 uppercase tracking-wide">{c.label}</div>
          <div className="mt-2 text-2xl font-semibold">{c.value}</div>
          <div className="mt-1 text-xs text-white/40">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
