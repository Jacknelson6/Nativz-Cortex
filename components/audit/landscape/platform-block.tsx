'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AuditPlatform, AuditScorecard, CompetitorProfile, PlatformReport } from '@/lib/audit/types';
import { StatusDot } from './status-dot';
import { cn } from '@/lib/utils/cn';

// Order matches the spec's group order; labels match scorecard category strings.
const PER_PLATFORM_ROWS: Array<{ category: string; label: string }> = [
  { category: 'engagement_rate', label: 'Engagement rate' },
  { category: 'avg_views', label: 'Avg views' },
  { category: 'follower_to_view', label: 'Follower-to-view' },
  { category: 'posting_frequency', label: 'Posting frequency' },
  { category: 'cadence_trend', label: 'Cadence trend' },
  { category: 'content_variety', label: 'Content variety' },
  { category: 'content_quality', label: 'Content quality' },
  { category: 'hook_consistency', label: 'Hook consistency' },
  { category: 'caption_optimization', label: 'Caption optimization' },
  { category: 'hashtag_strategy', label: 'Hashtag strategy' },
];

function findItem(scorecard: AuditScorecard, category: string, platform: AuditPlatform) {
  // Scorecard labels follow "<Label> · <platform>" for per-platform items.
  return scorecard.items.find(
    (i) => i.category === category && i.label.toLowerCase().endsWith(platform),
  );
}

export function PlatformBlock({
  platform,
  prospectReport,
  scorecard,
  competitors,
}: {
  platform: AuditPlatform;
  prospectReport: PlatformReport;
  scorecard: AuditScorecard;
  competitors: CompetitorProfile[];
}) {
  const [expanded, setExpanded] = useState(true);
  const compsOnPlatform = competitors.filter((c) => c.platform === platform).slice(0, 3);

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-nativz-border">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between bg-surface/40 px-3 py-2 text-left"
      >
        <span className="text-sm font-semibold capitalize text-text-primary">{platform}</span>
        <ChevronDown size={14} className={cn('transition-transform text-text-muted', !expanded && '-rotate-90')} />
      </button>
      {expanded && (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-nativz-border bg-surface/20">
              <th className="px-3 py-1.5 text-left font-normal text-text-muted">Metric</th>
              <th className="px-3 py-1.5 text-left font-semibold text-accent-text">{prospectReport.profile.username}</th>
              {compsOnPlatform.map((c) => (
                <th key={c.username} className="px-3 py-1.5 text-left font-normal text-text-secondary">{c.username}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PER_PLATFORM_ROWS.map((row) => {
              const item = findItem(scorecard, row.category, platform);
              return (
                <tr key={row.category} className="border-b border-nativz-border/60 last:border-b-0">
                  <td className="px-3 py-1.5 text-text-secondary">{row.label}</td>
                  <td className="px-3 py-1.5">
                    {item ? (
                      <span className="inline-flex items-center gap-1.5">
                        <StatusDot status={item.prospectStatus} reason={item.status_reason} />
                        <span className="text-text-primary">{item.prospectValue}</span>
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  {compsOnPlatform.map((comp) => {
                    const compEntry = item?.competitors.find((c) => c.username === comp.username);
                    return (
                      <td key={comp.username} className="px-3 py-1.5">
                        {compEntry ? (
                          <span className="inline-flex items-center gap-1.5">
                            <StatusDot status={compEntry.status} />
                            <span className="text-text-secondary">{compEntry.value}</span>
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
