// SPY-04 T23: server-renderable public scorecard. Dark theme, brand
// hex `accent-text`, no admin chrome. Used by /shared/prospect/[token].

import { CheckCircle2, Circle, AlertTriangle, MinusCircle } from 'lucide-react';
import type { ChecklistItem, ChecklistScore, ScorecardSnapshot } from '@/lib/prospects/checklist';

interface Props {
  brandName: string;
  handle: string | null;
  platform: string | null;
  snapshot: ScorecardSnapshot;
  signedPdfUrl: string | null;
  leadEmail: string;
}

function scoreIcon(score: ChecklistScore) {
  switch (score) {
    case 'green':
      return <CheckCircle2 size={18} className="text-emerald-400" />;
    case 'yellow':
      return <Circle size={18} className="text-amber-400" />;
    case 'red':
      return <AlertTriangle size={18} className="text-red-400" />;
    default:
      return <MinusCircle size={18} className="text-text-muted" />;
  }
}

function scoreLabel(score: ChecklistScore): string {
  if (score === 'green') return 'On point';
  if (score === 'yellow') return 'Tighten';
  if (score === 'red') return 'Fix first';
  return 'No data';
}

export function ProspectScorecardPublic({
  brandName,
  handle,
  platform,
  snapshot,
  signedPdfUrl,
  leadEmail,
}: Props) {
  const { items, summary, generated_at } = snapshot;
  const generated = new Date(generated_at).toLocaleDateString();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10 text-center">
        <p className="text-xs font-medium uppercase tracking-wide accent-text">Profile scorecard</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{brandName}</h1>
        {handle && (
          <p className="mt-2 text-sm text-text-muted">
            @{handle}
            {platform ? ` on ${platform}` : ''} · scored {generated}
          </p>
        )}
        <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-3 rounded-xl border border-border bg-surface px-5 py-3 text-sm">
          <SummaryPill label="Green" value={summary.green} className="text-emerald-400" />
          <SummaryPill label="Yellow" value={summary.yellow} className="text-amber-400" />
          <SummaryPill label="Red" value={summary.red} className="text-red-400" />
          <SummaryPill label="N/A" value={summary.na} className="text-text-muted" />
        </div>
      </header>

      <ol className="space-y-3">
        {items.map((item: ChecklistItem, i) => (
          <li
            key={item.id}
            className="rounded-xl border border-border bg-surface px-5 py-4"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5">{scoreIcon(item.score)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-medium text-foreground">
                    {String(i + 1).padStart(2, '0')}. {item.title}
                  </h2>
                  <span className="text-xs uppercase tracking-wide text-text-muted">
                    {scoreLabel(item.score)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-text-muted">{item.description}</p>
                <p className="mt-2 text-sm text-foreground">{item.note}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <footer className="mt-12 rounded-xl border border-accent/40 bg-accent/5 px-6 py-6 text-center">
        <h3 className="text-base font-medium text-foreground">Want to fix the reds?</h3>
        <p className="mt-1 text-sm text-text-muted">
          Reply to the email this link came from or reach out directly.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <a
            href={`mailto:${leadEmail}?subject=${encodeURIComponent(`Scorecard follow-up · ${brandName}`)}`}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            Talk to a strategist
          </a>
          {signedPdfUrl && (
            <a
              href={signedPdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm text-foreground hover:bg-background"
            >
              Download PDF
            </a>
          )}
        </div>
      </footer>
    </main>
  );
}

function SummaryPill({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={`text-base font-semibold ${className}`}>{value}</span>
      <span className="text-xs text-text-muted">{label}</span>
    </span>
  );
}
