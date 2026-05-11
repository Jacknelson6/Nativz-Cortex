// SPY-10 T24: per-prospect telemetry panel. Server component. Shows last
// 3 drafts with status + sent_at + open/click counts derived from
// prospect_digest_events. Read-only, intended as a sidebar widget.

import { createAdminClient } from '@/lib/supabase/admin';
import type { DigestDraft, DigestEventRow } from '@/lib/prospects/types';

interface Props {
  prospectId: string;
}

const STATUS_LABELS: Record<string, string> = {
  drafted: 'Drafted',
  approved: 'Approved',
  sent: 'Sent',
  rejected: 'Rejected',
  expired: 'Expired',
};

const STATUS_COLOR: Record<string, string> = {
  drafted: 'text-amber-300',
  approved: 'text-blue-300',
  sent: 'text-emerald-300',
  rejected: 'text-white/50',
  expired: 'text-white/40',
};

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400000);
  if (d < 1) return 'today';
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

export async function DigestTelemetryPanel({ prospectId }: Props) {
  const admin = createAdminClient();
  const { data: drafts } = await admin
    .from('prospect_digest_drafts')
    .select('id, kind, status, created_at, sent_at, subject')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
    .limit(3);

  const list = (drafts ?? []) as DigestDraft[];
  if (list.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-surface p-4">
        <div className="text-sm font-medium mb-1">Digests</div>
        <div className="text-xs text-white/50">No digests built yet.</div>
      </div>
    );
  }

  const ids = list.map((d) => d.id);
  const { data: events } = await admin
    .from('prospect_digest_events')
    .select('draft_id, kind')
    .in('draft_id', ids);
  const counts = new Map<string, { opened: number; clicked: number }>();
  for (const row of ((events ?? []) as DigestEventRow[])) {
    const c = counts.get(row.draft_id) ?? { opened: 0, clicked: 0 };
    if (row.kind === 'opened') c.opened += 1;
    if (row.kind === 'clicked') c.clicked += 1;
    counts.set(row.draft_id, c);
  }

  return (
    <div className="rounded-xl border border-white/5 bg-surface p-4">
      <div className="text-sm font-medium mb-3">Recent digests</div>
      <ul className="space-y-2.5">
        {list.map((d) => {
          const c = counts.get(d.id) ?? { opened: 0, clicked: 0 };
          return (
            <li key={d.id} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-white/80">{d.subject ?? d.kind}</span>
                <span className={STATUS_COLOR[d.status] ?? 'text-white/50'}>
                  {STATUS_LABELS[d.status] ?? d.status}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-white/40">
                <span>{timeAgo(d.sent_at ?? d.created_at)}</span>
                {d.status === 'sent' && (
                  <>
                    <span>·</span>
                    <span>{c.opened} open</span>
                    <span>·</span>
                    <span>{c.clicked} click</span>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
