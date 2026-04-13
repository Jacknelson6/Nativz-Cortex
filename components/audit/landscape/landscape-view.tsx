import type { AuditReport } from '@/lib/audit/types';
import { ToplineCard } from './topline-card';
import { CalloutCards } from './callout-cards';
import { AccountLevelGrid } from './account-level-grid';
import { PlatformBlock } from './platform-block';

export function LandscapeView({ report }: { report: AuditReport }) {
  // Prospect handle — derive from the first platform report (all share the brand).
  const prospectUsername = report.platforms[0]?.profile.displayName ?? 'You';

  return (
    <div className="flex flex-col">
      <ToplineCard scorecard={report.scorecard} competitors={report.competitors} />
      <CalloutCards scorecard={report.scorecard} socialGoals={report.socialGoals} />
      <AccountLevelGrid
        scorecard={report.scorecard}
        prospectUsername={prospectUsername}
        competitors={report.competitors}
      />
      {report.platforms.map((p) => (
        <PlatformBlock
          key={p.platform}
          platform={p.platform}
          prospectReport={p}
          scorecard={report.scorecard}
          competitors={report.competitors}
        />
      ))}
    </div>
  );
}
