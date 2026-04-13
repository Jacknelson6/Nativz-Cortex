import type { AuditScorecard, CompetitorProfile } from '@/lib/audit/types';
import { StatusDot } from './status-dot';

const ACCOUNT_CATEGORIES = ['platform_focus_account', 'bio_optimization_account', 'cta_intent_account'] as const;

export function AccountLevelGrid({
  scorecard,
  prospectUsername,
  competitors,
}: {
  scorecard: AuditScorecard;
  prospectUsername: string;
  competitors: CompetitorProfile[];
}) {
  // Unique competitor usernames preserving order of discovery
  const compUsernames = Array.from(new Set(competitors.map((c) => c.username))).slice(0, 3);
  const items = ACCOUNT_CATEGORIES
    .map((cat) => scorecard.items.find((i) => i.category === cat))
    .filter((i): i is NonNullable<typeof i> => Boolean(i));

  if (items.length === 0) return null;

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-nativz-border">
      <div className="border-b border-nativz-border bg-surface/40 px-3 py-1.5 text-[10px] uppercase tracking-wider text-text-muted">
        Account-level
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-nativz-border bg-surface/20">
            <th className="px-3 py-1.5 text-left font-normal text-text-muted">Metric</th>
            <th className="px-3 py-1.5 text-left font-semibold text-accent-text">{prospectUsername}</th>
            {compUsernames.map((u) => (
              <th key={u} className="px-3 py-1.5 text-left font-normal text-text-secondary">{u}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.category} className="border-b border-nativz-border/60 last:border-b-0">
              <td className="px-3 py-1.5 text-text-secondary">{item.label.replace(' · account', '')}</td>
              <td className="px-3 py-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <StatusDot status={item.prospectStatus} reason={item.status_reason} />
                  <span className="text-text-primary">{item.prospectValue}</span>
                </span>
              </td>
              {compUsernames.map((u) => {
                const c = item.competitors.find((x) => x.username === u);
                return (
                  <td key={u} className="px-3 py-1.5">
                    {c ? (
                      <span className="inline-flex items-center gap-1.5">
                        <StatusDot status={c.status} />
                        <span className="text-text-secondary">{c.value}</span>
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
