/**
 * Smoke tests for the phase state machine + month helpers.
 *
 * No test framework. Each assertion prints PASS / FAIL and the suite
 * exits non-zero if anything fails. Run via:
 *
 *   npx tsx scripts/test-state-machine.ts
 */

import {
  isValidTransition,
  nextActionsFor,
  primaryActionFor,
  autoAdvancedPhase,
  FORWARD_TRANSITIONS,
} from '../lib/content-projects/phase-state-machine';
import {
  toFirstOfMonth,
  currentMonth,
  adjacentMonth,
  formatMonthLong,
  groupByContentMonth,
} from '../lib/content-projects/month-utils';
import type { EditingProjectPhase } from '../lib/editing/types';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.error(`  FAIL  ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

console.log('--- phase-state-machine ---');

// Forward transitions are valid.
check(
  'Planning -> Shoot booked is valid',
  isValidTransition('Planning', 'Shoot booked'),
);
check(
  'Editing -> Client review is valid',
  isValidTransition('Editing', 'Client review'),
);
check(
  'Publishing -> Done is valid',
  isValidTransition('Publishing', 'Done'),
);

// Same-state is rejected.
check(
  'Editing -> Editing is rejected',
  !isValidTransition('Editing', 'Editing'),
);

// Random jump is rejected.
check(
  'Planning -> Done is rejected',
  !isValidTransition('Planning', 'Done'),
);
check(
  'Editing -> Approved is rejected (must go through Client review)',
  !isValidTransition('Editing', 'Approved'),
);

// Allowed back-transitions.
check(
  'Client review -> Editing is valid (send back)',
  isValidTransition('Client review', 'Editing'),
);
check(
  'Approved -> Client review is valid (reopen)',
  isValidTransition('Approved', 'Client review'),
);

// Random backwards jump is rejected.
check(
  'Approved -> Editing is rejected (only 1 step back allowed)',
  !isValidTransition('Approved', 'Editing'),
);
check(
  'Done -> Planning is rejected',
  !isValidTransition('Done', 'Planning'),
);

// Terminal state has no forward.
check(
  'FORWARD_TRANSITIONS["Done"] is null',
  FORWARD_TRANSITIONS.Done === null,
);

// Role lens: PM sees both Client review actions, editor sees only the
// "send back" tertiary one.
const pmReviewActions = nextActionsFor('Client review', 'pm');
const editorReviewActions = nextActionsFor('Client review', 'editor');
check(
  'PM sees 2 actions at Client review',
  pmReviewActions.length === 2,
  `got ${pmReviewActions.length}`,
);
check(
  'Editor sees 1 action at Client review (Send back to editing)',
  editorReviewActions.length === 1 &&
    editorReviewActions[0].toPhase === 'Editing',
  JSON.stringify(editorReviewActions),
);

// Videographer has nothing to do at Editing.
const videographerEditing = nextActionsFor('Editing', 'videographer');
check(
  'Videographer has no actions at Editing',
  videographerEditing.length === 0,
);

// Editor has no actions at Approved.
const editorApproved = nextActionsFor('Approved', 'editor');
check(
  'Editor has no actions at Approved',
  editorApproved.length === 0,
);

// Primary action.
const planningPrimary = primaryActionFor('Planning', 'pm');
check(
  'Primary at Planning -> Shoot booked',
  planningPrimary?.toPhase === 'Shoot booked',
);

// Auto-advance logic.
check(
  'Shoot done + drive folder => Raw uploaded auto-advance',
  autoAdvancedPhase({
    phase: 'Shoot done',
    hasDriveFolderUrl: true,
    hasEditingVideos: false,
    hasShareLink: false,
    hasScheduledPosts: false,
  }) === 'Raw uploaded',
);
check(
  'Editing + share link => Client review auto-advance',
  autoAdvancedPhase({
    phase: 'Editing',
    hasDriveFolderUrl: false,
    hasEditingVideos: false,
    hasShareLink: true,
    hasScheduledPosts: false,
  }) === 'Client review',
);
check(
  'Approved + scheduled posts => Publishing auto-advance',
  autoAdvancedPhase({
    phase: 'Approved',
    hasDriveFolderUrl: false,
    hasEditingVideos: false,
    hasShareLink: false,
    hasScheduledPosts: true,
  }) === 'Publishing',
);
check(
  'Planning + everything false => null',
  autoAdvancedPhase({
    phase: 'Planning',
    hasDriveFolderUrl: false,
    hasEditingVideos: false,
    hasShareLink: false,
    hasScheduledPosts: false,
  }) === null,
);

// Walk through the full forward chain to confirm each step is valid.
const chain: EditingProjectPhase[] = [
  'Planning',
  'Shoot booked',
  'Shoot done',
  'Raw uploaded',
  'Editing',
  'Client review',
  'Approved',
  'Publishing',
  'Done',
];
for (let i = 0; i < chain.length - 1; i += 1) {
  const a = chain[i];
  const b = chain[i + 1];
  check(`Full chain step: ${a} -> ${b}`, isValidTransition(a, b));
}

console.log('--- month-utils ---');

check(
  'toFirstOfMonth("2026-05-17") = "2026-05-01"',
  toFirstOfMonth('2026-05-17') === '2026-05-01',
);
check(
  'toFirstOfMonth(null) = null',
  toFirstOfMonth(null) === null,
);
check(
  'toFirstOfMonth("garbage") = null',
  toFirstOfMonth('garbage') === null,
);
check(
  'toFirstOfMonth(Date 2026-01-01) = "2026-01-01"',
  toFirstOfMonth(new Date(2026, 0, 1)) === '2026-01-01',
);

check(
  'currentMonth() matches today (YYYY-MM-01)',
  /^\d{4}-\d{2}-01$/.test(currentMonth()),
  currentMonth(),
);

check(
  'adjacentMonth("2026-05-01", -1) = "2026-04-01"',
  adjacentMonth('2026-05-01', -1) === '2026-04-01',
);
check(
  'adjacentMonth("2026-01-01", -1) = "2025-12-01" (year wrap)',
  adjacentMonth('2026-01-01', -1) === '2025-12-01',
);
check(
  'adjacentMonth("2026-12-01", 1) = "2027-01-01" (year wrap fwd)',
  adjacentMonth('2026-12-01', 1) === '2027-01-01',
);

check(
  'formatMonthLong("2026-05-01") = "May 2026"',
  formatMonthLong('2026-05-01') === 'May 2026',
);
check(
  'formatMonthLong(null) = "Unscheduled"',
  formatMonthLong(null) === 'Unscheduled',
);

// groupByContentMonth: newest-first, null bucket last.
const grouped = groupByContentMonth([
  { content_month: '2026-04-01' } as { content_month: string | null },
  { content_month: null } as { content_month: string | null },
  { content_month: '2026-05-01' } as { content_month: string | null },
  { content_month: '2026-05-01' } as { content_month: string | null },
]);
check(
  'groupByContentMonth: 3 buckets',
  grouped.length === 3,
);
check(
  'groupByContentMonth: newest first (May 2026 bucket #0)',
  grouped[0].month === '2026-05-01' && grouped[0].projects.length === 2,
);
check(
  'groupByContentMonth: April 2026 in middle',
  grouped[1].month === '2026-04-01',
);
check(
  'groupByContentMonth: null bucket last',
  grouped[2].month === null,
);

console.log('---');
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
