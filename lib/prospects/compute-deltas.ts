// SPY-05 T08: pure delta computation between prospect's scorecard and a
// set of competitor scorecards. Per item, classify as:
//   - "behind" if at least one competitor outscores the prospect
//   - "ahead" if the prospect outscores every competitor with a non-NA score
//   - "tied" otherwise (all equal among comparable competitors)
//
// "Comparable" excludes NA scores on either side — an item where a
// competitor didn't have enough data shouldn't drag the comparison.

import type { ChecklistItemId, ChecklistScore, ScorecardSnapshot } from './checklist';
import type { BenchmarkDeltas } from './types';

const RANK: Record<ChecklistScore, number> = {
  red: 0,
  yellow: 1,
  green: 2,
  na: -1,
};

function compare(prospect: ChecklistScore, competitor: ChecklistScore): 'behind' | 'ahead' | 'tied' | 'na' {
  if (prospect === 'na' || competitor === 'na') return 'na';
  const p = RANK[prospect];
  const c = RANK[competitor];
  if (c > p) return 'behind';
  if (p > c) return 'ahead';
  return 'tied';
}

export function computeDeltas(
  prospect: ScorecardSnapshot,
  competitors: Array<{ scorecard: ScorecardSnapshot | null }>,
): BenchmarkDeltas {
  const behind: ChecklistItemId[] = [];
  const ahead: ChecklistItemId[] = [];
  const tied: ChecklistItemId[] = [];

  for (const item of prospect.items) {
    let anyBehind = false;
    let anyAhead = false;
    let anyComparable = false;

    for (const comp of competitors) {
      const cItem = comp.scorecard?.items.find((i) => i.id === item.id);
      if (!cItem) continue;
      const cmp = compare(item.score, cItem.score);
      if (cmp === 'na') continue;
      anyComparable = true;
      if (cmp === 'behind') anyBehind = true;
      else if (cmp === 'ahead') anyAhead = true;
    }

    // Priority: behind > ahead > tied. "Behind on at least one" is the
    // sharpest sales hook so it wins even when also ahead of another comp.
    if (!anyComparable) continue;
    if (anyBehind) behind.push(item.id);
    else if (anyAhead) ahead.push(item.id);
    else tied.push(item.id);
  }

  return { behind, ahead, tied };
}
