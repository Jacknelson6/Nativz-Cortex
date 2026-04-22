import Link from 'next/link';
import { ArrowRight, Globe } from 'lucide-react';

interface AuditCard {
  id: string;
  status: string;
  created_at: string;
  brand_name: string;
  website: string | null;
  favicon: string | null;
  scorecard: Record<string, unknown> | null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusTone(status: string): string {
  switch (status) {
    case 'completed':
      return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
    case 'failed':
      return 'border-coral-500/30 bg-coral-500/10 text-coral-300';
    case 'processing':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    default:
      return 'border-text-muted/30 bg-surface-hover/60 text-text-secondary';
  }
}

export function LatestAuditsStrip({ audits }: { audits: AuditCard[] }) {
  return (
    <section className="animate-ci-rise space-y-3" style={{ animationDelay: '300ms' }}>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p
            className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300/80"
            style={{ fontFamily: 'Rubik, system-ui, sans-serif', fontStyle: 'italic' }}
          >
            Recent
          </p>
          <h2
            className="mt-1 text-xl font-semibold text-text-primary"
            style={{ fontFamily: 'Jost, system-ui, sans-serif' }}
          >
            Latest audits
          </h2>
        </div>
        <Link
          href="/admin/analyze-social"
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-cyan-300"
        >
          View all <ArrowRight size={13} />
        </Link>
      </div>

      {audits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-nativz-border bg-surface/40 p-8 text-center text-sm text-text-muted">
          No audits yet.{' '}
          <Link href="/admin/analyze-social" className="text-cyan-300 underline decoration-dotted">
            Run your first audit
          </Link>
          .
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {audits.slice(0, 4).map((a) => (
            <Link
              key={a.id}
              href={`/admin/analyze-social/${a.id}`}
              className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-nativz-border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-cyan-500/30"
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-300">
                  {a.favicon ? (
                    <img src={a.favicon} alt="" className="h-6 w-6 rounded" />
                  ) : (
                    <Globe size={16} />
                  )}
                </span>
                <div className="min-w-0">
                  <div
                    className="truncate text-sm font-semibold text-text-primary"
                    style={{ fontFamily: 'Jost, system-ui, sans-serif' }}
                  >
                    {a.brand_name}
                  </div>
                  <div className="truncate font-mono text-[10px] text-text-muted">
                    {a.website ?? '—'}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusTone(a.status)}`}
                >
                  {a.status}
                </span>
                <span className="font-mono text-[10px] text-text-muted/80">{timeAgo(a.created_at)}</span>
              </div>
              <ArrowRight
                className="absolute bottom-4 right-4 text-text-muted/40 transition-all group-hover:text-cyan-300 group-hover:translate-x-1"
                size={14}
              />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
