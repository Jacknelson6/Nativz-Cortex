import Link from 'next/link';
import { ArrowUpRight, CircleAlert, CircleDashed, CircleDot, CircleSlash, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { BrandAuditRow } from '@/lib/brand-audits/types';

interface AuditListRow {
  id: string;
  brand_name: string;
  category: string | null;
  status: BrandAuditRow['status'];
  visibility_score: number | null;
  sentiment_score: number | null;
  sentiment_breakdown: BrandAuditRow['sentiment_breakdown'];
  models: string[];
  prompt_count: number;
  created_at: string;
  completed_at: string | null;
  attached_client_name: string | null;
}

interface SelfAuditHistoryListProps {
  audits: AuditListRow[];
}

export function SelfAuditHistoryList({ audits }: SelfAuditHistoryListProps) {
  if (audits.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-nativz-border bg-surface/40 p-10 text-center text-sm text-text-muted">
        No self-audits yet. Run one above and it&apos;ll show up here.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <ul className="divide-y divide-nativz-border">
        {audits.map((audit) => (
          <li key={audit.id}>
            <Link
              href={`/spying/self-audit/${audit.id}`}
              className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-hover/40"
            >
              <StatusDot status={audit.status} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-display text-sm font-semibold text-text-primary">
                    {audit.brand_name}
                  </span>
                  {audit.attached_client_name ? (
                    <span className="rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent-text">
                      {audit.attached_client_name}
                    </span>
                  ) : null}
                  {audit.category ? (
                    <span className="hidden text-[11px] text-text-muted sm:inline">· {audit.category}</span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
                  <span>{formatRelative(audit.created_at)}</span>
                  <span className="text-text-muted/50">·</span>
                  <span>
                    {audit.prompt_count} prompt{audit.prompt_count === 1 ? '' : 's'}
                  </span>
                  <span className="text-text-muted/50">·</span>
                  <span>
                    {audit.models.length} model{audit.models.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              <div className="hidden flex-shrink-0 items-center gap-5 md:flex">
                <Metric label="Visibility" value={audit.visibility_score} suffix="%" />
                <SentimentMicro
                  breakdown={audit.sentiment_breakdown}
                  score={audit.sentiment_score}
                />
              </div>

              <ArrowUpRight
                size={14}
                className="ml-1 flex-shrink-0 text-text-muted/60 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-text"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusDot({ status }: { status: BrandAuditRow['status'] }) {
  if (status === 'running') {
    return <Loader2 size={14} className="flex-shrink-0 animate-spin text-accent-text" />;
  }
  if (status === 'failed') {
    return <CircleAlert size={14} className="flex-shrink-0 text-coral-300" />;
  }
  if (status === 'completed') {
    return <CircleDot size={14} className="flex-shrink-0 text-emerald-400" />;
  }
  if (status === 'pending') {
    return <CircleDashed size={14} className="flex-shrink-0 text-text-muted" />;
  }
  return <CircleSlash size={14} className="flex-shrink-0 text-text-muted" />;
}

function Metric({ label, value, suffix }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div className="text-right">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">{label}</div>
      <div
        className={cn(
          'mt-0.5 font-display text-sm font-semibold',
          value === null ? 'text-text-muted/60' : 'text-text-primary',
        )}
      >
        {value === null ? '—' : `${Math.round(value)}${suffix ?? ''}`}
      </div>
    </div>
  );
}

function SentimentMicro({
  breakdown,
  score,
}: {
  breakdown: BrandAuditRow['sentiment_breakdown'];
  score: number | null;
}) {
  const total =
    breakdown.positive + breakdown.neutral + breakdown.negative + breakdown.not_mentioned;
  if (total === 0) {
    return <Metric label="Sentiment" value={null} />;
  }
  const pos = (breakdown.positive / total) * 100;
  const neu = (breakdown.neutral / total) * 100;
  const neg = (breakdown.negative / total) * 100;
  return (
    <div className="text-right">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">Sentiment</div>
      <div className="mt-1 flex h-1.5 w-28 overflow-hidden rounded-full bg-white/5">
        {pos > 0 ? <span style={{ width: `${pos}%` }} className="bg-emerald-400" /> : null}
        {neu > 0 ? <span style={{ width: `${neu}%` }} className="bg-amber-400/70" /> : null}
        {neg > 0 ? <span style={{ width: `${neg}%` }} className="bg-coral-400" /> : null}
      </div>
      <div className="mt-1 font-mono text-[10px] text-text-muted">
        {score === null ? '—' : score.toFixed(2)}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
