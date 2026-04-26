import Link from 'next/link';
import { ArrowRight, Globe } from 'lucide-react';

interface AuditRow {
  id: string;
  status: string;
  created_at: string;
  brand_name: string;
  website: string | null;
  favicon: string | null;
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

const STATUS_TONE: Record<string, string> = {
  completed: 'bg-cyan-500/15 text-cyan-200',
  failed: 'bg-coral-500/15 text-coral-200',
  processing: 'bg-amber-500/15 text-amber-200',
};

function statusTone(status: string): string {
  return STATUS_TONE[status] ?? 'bg-surface-hover/60 text-text-secondary';
}

export function LatestAuditsList({ audits }: { audits: AuditRow[] }) {
  return (
    <section
      className="animate-ci-rise space-y-3"
      style={{ animationDelay: '240ms' }}
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p
            className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300/80"
            style={{ fontStyle: 'italic', fontFamily: 'Rubik, system-ui, sans-serif' }}
          >
            Recent
          </p>
          <h2
            className="mt-1 text-base font-semibold text-text-primary"
            style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif' }}
          >
            Latest audits
          </h2>
        </div>
        <Link
          href="/spying/audits"
          className="inline-flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-cyan-300"
        >
          View all <ArrowRight size={12} />
        </Link>
      </div>

      {audits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-nativz-border bg-surface/40 p-8 text-center text-sm text-text-muted">
          No audits yet — paste a URL above to run your first one.
        </div>
      ) : (
        <ul className="divide-y divide-nativz-border/60 overflow-hidden rounded-xl border border-nativz-border bg-surface">
          {audits.slice(0, 6).map((a) => (
            <li key={a.id}>
              <Link
                href={`/admin/analyze-social/${a.id}`}
                className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-hover/40"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-cyan-500/10 text-cyan-300">
                  {a.favicon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.favicon} alt="" className="h-9 w-9 object-cover" />
                  ) : (
                    <Globe size={15} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-sm font-semibold text-text-primary"
                    style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif' }}
                  >
                    {a.brand_name}
                  </div>
                  {a.website ? (
                    <div className="truncate font-mono text-[10px] text-text-muted">{a.website}</div>
                  ) : null}
                </div>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusTone(a.status)}`}
                >
                  {a.status}
                </span>
                <span className="hidden shrink-0 font-mono text-[10px] text-text-muted/80 sm:inline">
                  {timeAgo(a.created_at)}
                </span>
                <ArrowRight
                  size={13}
                  className="shrink-0 text-text-muted/40 transition-all group-hover:translate-x-0.5 group-hover:text-cyan-300"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
