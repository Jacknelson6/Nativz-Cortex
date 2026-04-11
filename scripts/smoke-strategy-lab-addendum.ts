/**
 * Regression guard for the Strategy Lab system-prompt addendum.
 *
 * The addendum teaches the Nerd how to produce artifact-style outputs
 * (mermaid diagrams, html-visual blocks, structured scripts, 5-part
 * artifact templates). Accidentally stripping any of these keywords
 * collapses the output back to plain paragraphs and silently breaks
 * the chat's artifact canvas. This smoke test trips the build if any
 * of the load-bearing phrases go missing.
 *
 * Run: npx tsx scripts/smoke-strategy-lab-addendum.ts
 */
import { STRATEGY_LAB_ADDENDUM } from '../lib/nerd/strategy-lab-scripting-context';

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('PASS:', msg);
  }
}

// Core section headers
assert(STRATEGY_LAB_ADDENDUM.includes('STRATEGY LAB MODE'), 'mode banner present');
assert(STRATEGY_LAB_ADDENDUM.includes('Ground-rules'), 'ground-rules section present');
assert(STRATEGY_LAB_ADDENDUM.includes('Deliverable formats'), 'deliverable formats section present');
assert(STRATEGY_LAB_ADDENDUM.includes('Visual artifacts'), 'visual artifacts section present');
assert(STRATEGY_LAB_ADDENDUM.includes('Artifact workflow'), 'artifact workflow section present');

// Rendering primitives the chat understands
assert(STRATEGY_LAB_ADDENDUM.includes('mermaid'), 'mermaid rendering primitive taught');
assert(STRATEGY_LAB_ADDENDUM.includes('html-visual'), 'html-visual rendering primitive taught');
assert(STRATEGY_LAB_ADDENDUM.includes('flowchart'), 'flowchart syntax hint present');
assert(STRATEGY_LAB_ADDENDUM.includes('quadrantChart'), 'quadrantChart hint present (effort vs impact)');

// Artifact template structure
assert(
  STRATEGY_LAB_ADDENDUM.includes('TL;DR') || STRATEGY_LAB_ADDENDUM.includes('tl;dr'),
  'artifact template mentions TL;DR',
);
assert(
  STRATEGY_LAB_ADDENDUM.includes('Next actions'),
  'artifact template mentions Next actions',
);

// Script format guidance
assert(STRATEGY_LAB_ADDENDUM.includes('Hook'), 'script format requires a Hook');
assert(STRATEGY_LAB_ADDENDUM.includes('pattern interrupt'), 'script format mentions pattern interrupt');
assert(STRATEGY_LAB_ADDENDUM.includes('CTA'), 'script format mentions CTA');

// Budget check — if the addendum grows beyond ~10k chars we should be
// trimming, not accepting it silently.
assert(
  STRATEGY_LAB_ADDENDUM.length < 10_000,
  `addendum is ${STRATEGY_LAB_ADDENDUM.length} chars (cap 10k — trim if over)`,
);

console.log(`\nAddendum length: ${STRATEGY_LAB_ADDENDUM.length} chars`);
