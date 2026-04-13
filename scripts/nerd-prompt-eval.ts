/**
 * Nerd prompt evaluation harness — "Karpathy-style" auto-prompt optimization.
 *
 * The pattern (DSPy / OPRO / AutoPrompt):
 *   1. Run the CURRENT system prompt against a suite of golden-standard
 *      user queries (artifact generation, script writing, analytics
 *      diagnosis, content strategy).
 *   2. Use a separate LLM call as a JUDGE — score each output on a
 *      concrete rubric (specificity, structure, actionability, no filler,
 *      visual use when appropriate).
 *   3. Ask the judge to suggest specific prompt edits that would improve
 *      low-scoring dimensions.
 *   4. Apply edits → re-run → did it improve? (manual loop today,
 *      automatic later).
 *
 * Why this matters: the Nerd's output quality is the product. Without a
 * harness, prompt changes are guesses. With the harness, every prompt
 * change is measurable — "scenario 3 specificity went 2.4 → 4.1 after
 * we added the knowledge-vault search rule."
 *
 * Usage:
 *   npx tsx scripts/nerd-prompt-eval.ts
 *   npx tsx scripts/nerd-prompt-eval.ts --scenario 1      # single scenario
 *   npx tsx scripts/nerd-prompt-eval.ts --verbose          # print full outputs
 *
 * Requires: OPENROUTER_API_KEY in .env.local
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadEnvLocal } from './load-env-local';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

loadEnvLocal();

// ---------------------------------------------------------------------------
// Load the CURRENT Nerd system prompt by reading the route file. This keeps
// the harness in sync with production — no copy/paste drift.
// ---------------------------------------------------------------------------

function loadCurrentSystemPrompt(): string {
  const routePath = resolve(REPO_ROOT, 'app/api/nerd/chat/route.ts');
  const src = readFileSync(routePath, 'utf8');
  // Match: const SYSTEM_PROMPT = `...`;
  const m = src.match(/const SYSTEM_PROMPT\s*=\s*`([\s\S]*?)`;/);
  if (!m) throw new Error('Could not find SYSTEM_PROMPT in route.ts — did its format change?');
  return m[1];
}

// ---------------------------------------------------------------------------
// Test scenarios — the "golden" queries the Nerd should handle well
// ---------------------------------------------------------------------------

interface Scenario {
  id: number;
  title: string;
  userMessage: string;
  /** What the response MUST contain to score well. */
  rubricFocus: string[];
  /** Should the response use a mermaid/html visual? */
  expectsVisual: boolean;
}

const SCENARIOS: Scenario[] = [
  {
    id: 1,
    title: 'Generate video ideas',
    userMessage:
      'Give me 5 video ideas for a boutique juice bar targeting Gen Z women in college towns. They want to grow TikTok followers.',
    rubricFocus: [
      '5 distinct ideas (not 3 with filler)',
      'Each idea has a specific hook in quotes',
      'Hooks are varied (curiosity, story, hot-take, not all same type)',
      'Concepts tied to Gen Z college-town context (not generic wellness)',
      'Numbered list with clear structure',
    ],
    expectsVisual: false,
  },
  {
    id: 2,
    title: 'Write a script',
    userMessage:
      'Write a 30-second TikTok script about why 6AM workouts are a trap. Skeptical, Gen Z tone.',
    rubricFocus: [
      'Opens with a hook (first 3 seconds) in quotes — no preamble',
      'Numbered beats, one sentence per beat',
      'Pattern interrupt around beat 4-5',
      'CTA that fits Gen Z / skeptical tone (not "follow for more")',
      'No camera directions or stage notes',
    ],
    expectsVisual: false,
  },
  {
    id: 3,
    title: 'Diagnose performance',
    userMessage:
      "Diagnose my TikTok performance. Last 30 days: 8 posts, avg 1,200 views, 2.1% ER, all educational talking-head. What's broken and what should I test?",
    rubricFocus: [
      'Leads with the specific diagnosis (not recap of numbers)',
      'At least 2 concrete root causes ("low completion rate" not "bad content")',
      'Actionable tests with expected outcome (what metric would move)',
      'References the provided data (1,200 views, 2.1% ER, 8 posts)',
      'No fabricated metrics',
    ],
    expectsVisual: false,
  },
  {
    id: 4,
    title: 'Content strategy map',
    userMessage:
      'Build a content strategy map for a fitness apparel brand: 4 content pillars with angles and posting cadence.',
    rubricFocus: [
      '4 distinct pillars (not 3 or 5)',
      'Each pillar has a one-line justification',
      'Posting cadence specified per pillar',
      'Includes a mermaid diagram of the strategy',
      'Pillars are specific to fitness apparel (not generic "education")',
    ],
    expectsVisual: true,
  },
];

// ---------------------------------------------------------------------------
// Generator — calls OpenRouter with current SYSTEM_PROMPT + user message
// ---------------------------------------------------------------------------

async function callOpenRouter(
  systemPrompt: string,
  userMessage: string,
  model = 'openai/gpt-5.4-mini',
  maxTokens = 2000,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY required in .env.local');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

// ---------------------------------------------------------------------------
// Judge — scores an output on the 5-axis rubric using a stronger model
// ---------------------------------------------------------------------------

interface JudgeScore {
  specificity: number;   // 1-5 — concrete vs generic
  structure: number;     // 1-5 — title/sections/next actions
  actionability: number; // 1-5 — user can act on it
  noFiller: number;      // 1-5 — no preamble / no "great question"
  visual: number;        // 1-5 — mermaid/html used when appropriate (N/A = 5)
  rubricMatch: number;   // 1-5 — how well it hits the scenario-specific rubric focus
  strengths: string[];
  weaknesses: string[];
  promptSuggestions: string[];
}

async function judgeOutput(
  scenario: Scenario,
  output: string,
  model = 'anthropic/claude-sonnet-4.5',
): Promise<JudgeScore> {
  const judgePrompt = `You are an expert reviewer grading outputs from a social media marketing AI strategist called "The Nerd". You will score a single output against a rubric and suggest specific improvements to the Nerd's SYSTEM PROMPT (not the user query) that would raise low scores on future runs.

SCENARIO: "${scenario.title}"
USER MESSAGE: ${scenario.userMessage}
SCENARIO-SPECIFIC RUBRIC (what the response MUST contain):
${scenario.rubricFocus.map((r) => `- ${r}`).join('\n')}
EXPECTS A VISUAL (mermaid/html): ${scenario.expectsVisual ? 'YES' : 'no, score 5 if none needed'}

OUTPUT TO GRADE:
"""
${output}
"""

Score each axis 1–5 (5 = excellent, 1 = terrible):
- specificity: concrete names/numbers/hooks vs generic platitudes
- structure: clear title → scannable sections → next actions
- actionability: user could execute this tomorrow
- noFiller: no preamble, no "great question", leads with the insight
- visual: mermaid/html used appropriately (if expectsVisual=YES, required; otherwise 5)
- rubricMatch: how many of the scenario-specific requirements are hit

Respond in JSON:
{
  "specificity": 1-5,
  "structure": 1-5,
  "actionability": 1-5,
  "noFiller": 1-5,
  "visual": 1-5,
  "rubricMatch": 1-5,
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "promptSuggestions": [
    "Concrete edit to the Nerd's SYSTEM_PROMPT that would fix a specific weakness",
    "Another specific system-prompt edit"
  ]
}

Return ONLY the JSON object, no prose before or after.`;

  const raw = await callOpenRouter('You are a precise reviewer. Return only JSON.', judgePrompt, model, 1500);
  // Strip markdown fences if present
  const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned) as JudgeScore;
  } catch (err) {
    throw new Error(`Judge returned non-JSON: ${cleaned.slice(0, 400)}`);
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function bar(score: number): string {
  const filled = Math.round(score);
  return '█'.repeat(filled) + '░'.repeat(5 - filled);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const verbose = args.has('--verbose') || args.has('-v');
  const singleIdx = (() => {
    for (const a of args) {
      const m = a.match(/^--scenario=?(\d+)$/);
      if (m) return parseInt(m[1], 10);
    }
    return null;
  })();
  const onlyOne = Array.from(args).find((a) => /^\d+$/.test(a));
  const targetId = singleIdx ?? (onlyOne ? parseInt(onlyOne, 10) : null);

  const systemPrompt = loadCurrentSystemPrompt();
  console.log(`\n🧪 Nerd prompt eval — loaded SYSTEM_PROMPT (${systemPrompt.length} chars)\n`);

  const scenarios = targetId ? SCENARIOS.filter((s) => s.id === targetId) : SCENARIOS;
  if (scenarios.length === 0) {
    console.error(`No scenarios match --scenario=${targetId}. Valid IDs: ${SCENARIOS.map((s) => s.id).join(', ')}`);
    process.exit(1);
  }

  const results: Array<{ scenario: Scenario; output: string; score: JudgeScore; elapsedMs: number }> = [];

  for (const scenario of scenarios) {
    const start = Date.now();
    process.stdout.write(`[scenario ${scenario.id}] ${scenario.title} — generating… `);
    const output = await callOpenRouter(systemPrompt, scenario.userMessage);
    process.stdout.write(`judging… `);
    const score = await judgeOutput(scenario, output);
    const elapsedMs = Date.now() - start;
    console.log(`done (${(elapsedMs / 1000).toFixed(1)}s)`);

    results.push({ scenario, output, score, elapsedMs });

    const axes = [
      ['specificity', score.specificity],
      ['structure', score.structure],
      ['actionability', score.actionability],
      ['noFiller', score.noFiller],
      ['visual', score.visual],
      ['rubricMatch', score.rubricMatch],
    ] as const;
    for (const [name, v] of axes) {
      console.log(`  ${name.padEnd(14)} ${bar(v)} ${v}/5`);
    }
    if (score.weaknesses.length > 0) {
      console.log(`  Weaknesses:`);
      for (const w of score.weaknesses) console.log(`    - ${w}`);
    }
    if (score.promptSuggestions.length > 0) {
      console.log(`  Prompt suggestions:`);
      for (const s of score.promptSuggestions) console.log(`    → ${s}`);
    }
    if (verbose) {
      console.log(`\n  --- OUTPUT (${output.length} chars) ---`);
      console.log(output.split('\n').map((l) => `  ${l}`).join('\n'));
      console.log(`  --- END OUTPUT ---`);
    }
    console.log('');
  }

  // Aggregate
  console.log('═'.repeat(60));
  console.log('AGGREGATE SCORES');
  console.log('═'.repeat(60));
  const axes = ['specificity', 'structure', 'actionability', 'noFiller', 'visual', 'rubricMatch'] as const;
  for (const axis of axes) {
    const mean = avg(results.map((r) => r.score[axis]));
    console.log(`  ${axis.padEnd(14)} ${bar(mean)} ${mean.toFixed(2)}/5`);
  }
  const overall = avg(results.flatMap((r) => axes.map((a) => r.score[a])));
  console.log('');
  console.log(`  OVERALL MEAN: ${overall.toFixed(2)}/5  (${(overall * 20).toFixed(0)}%)`);
  console.log('');

  // Write report
  const reportDir = resolve(REPO_ROOT, 'tmp/prompt-eval');
  mkdirSync(reportDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = resolve(reportDir, `report-${ts}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        systemPromptChars: systemPrompt.length,
        overall,
        axes: Object.fromEntries(
          axes.map((a) => [a, avg(results.map((r) => r.score[a]))]),
        ),
        scenarios: results.map((r) => ({
          id: r.scenario.id,
          title: r.scenario.title,
          score: r.score,
          elapsedMs: r.elapsedMs,
          outputLength: r.output.length,
          output: r.output,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`📄 Full report saved: ${reportPath}`);
  console.log('');
  console.log('Next: apply prompt suggestions to app/api/nerd/chat/route.ts, re-run to measure lift.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
