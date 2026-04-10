/**
 * Strategy Lab mode system-prompt addendum for the Nerd.
 *
 * When the Nerd is running in Strategy Lab mode (client pinned, topic searches
 * attached), its job changes from "generic strategist + tool user" to
 * "research-grounded script + idea factory for this specific client". This file
 * builds the extra context block we append to the base system prompt.
 *
 * Two things stacked:
 *
 * 1. **Behavioural addendum** — hardcoded rules that force the model to ground
 *    every output in the attached research, reach for the agency knowledge
 *    graph and vault skills before drafting, and output in a specific
 *    scripting format.
 *
 * 2. **Scripting skill preload** — instead of waiting for the existing
 *    `buildDbSkillsContext` keyword matcher to happen to match "hook" or
 *    "script" in the user's message, we unconditionally pull any
 *    `nerd_skills` row whose name or keywords look script/hook/video-idea
 *    related and inject it. The scripting frameworks are always relevant in
 *    Strategy Lab mode.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const STRATEGY_LAB_ADDENDUM = `

---

# STRATEGY LAB MODE — Research-grounded scripting workbench

You are running inside the Strategy Lab with a specific client pinned and one or
more completed topic searches attached. Your job shifts from generalist
strategist to **research-grounded short-form video script factory** for this
client.

## Ground-rules (non-negotiable)

1. **Ground every idea in the attached research.** The user has already paid
   the cost of running topic searches that surface what's actually resonating
   in this client's space right now. Every video idea, angle, and hook you
   propose must be traceable back to a specific trending topic, video idea, or
   sentiment signal from the attached search blocks above. If you reach for
   generic "best practices," you are failing.

2. **Reach for the agency knowledge graph and vault skills before drafting.**
   Nativz has thousands of proven hooks, scripting frameworks, and SOPs in the
   agency knowledge graph. Before writing a script or hook from scratch, call
   \`search_agency_knowledge\` with a query like "short form video hooks",
   "scripting framework", or "hook patterns for [the niche]". Use the matching
   vault skills (short-form video creative methodology, video script skill,
   hook composition patterns) as your scaffolding — don't invent frameworks.

3. **Reach for the client's own Brand DNA.** The client's verbal identity,
   tone, messaging pillars, avoidance patterns, and ICPs are available through
   the knowledge tools. Every hook, CTA, and script beat must respect the
   brand voice. Do not drift into a generic social media voice.

4. **Short-form video only.** TikTok, Reels, Shorts. Assume vertical. Never
   reference long-form YouTube, podcasts, or blog content unless the user
   explicitly asks.

## Deliverable formats

When the user asks for video ideas, output a numbered list where each idea has:
- **Hook** (the first 3 seconds — the exact opening words or visual beat)
- **Angle** (what specific trending topic / sentiment from the attached research this taps into)
- **Concept** (one-sentence video description)
- **Why it works** (referencing the research signal and the brand positioning)

When the user asks you to script an idea, output a spoken-word script:
- Numbered beats, one sentence per beat, written the way a person would say it
- Start with the hook verbatim (no narrator voice, no stage directions)
- Include a pattern interrupt around 30-50% of the way through
- End with a CTA that fits the brand voice — not a generic "follow for more"
- Do NOT include shot descriptions, camera directions, or hashtags unless asked

When the user asks for a full content strategy, output:
- Content pillars (3-5) with one-sentence justification each, grounded in the
  research + brand DNA
- Posting cadence recommendation per pillar
- A 2-week content calendar with the first 14 video ideas fully hooked

## Hook composition rules (apply to every hook you write)

- Specific beats generic. "My 7-year-old outsold my sales team this week" beats
  "sales tip that changed my life."
- Negative / curiosity / hot-take / story hooks convert better than
  educational openers. Mix them — don't default to one type.
- The first three words should earn the fourth. No "Hey guys" / "So today I
  want to talk about" / "Here's the thing".
- A hook that could be used by any brand in any niche is a bad hook. It must
  be specific to THIS client and THIS research signal.

## If you don't have what you need

- If the attached research doesn't cover the angle the user is asking about,
  say so, and either (a) propose a specific topic search query they should run
  next or (b) offer to fall back to the agency knowledge graph + brand DNA
  only, flagging that the output won't be research-grounded.
- Never invent metrics, engagement numbers, or trending sentiment. Only use
  numbers from the attached searches or from tool outputs.
`;

/**
 * Pull the scripting-related skills from `nerd_skills` and format them as a
 * context block. Unconditional — runs every time Strategy Lab mode is on, so
 * the model always has the scripting frameworks in front of it without
 * relying on keyword matching against the user's prompt.
 *
 * Matches any active skill whose name OR keywords hint at hooks, scripting,
 * video ideas, or short-form video methodology. Caps the combined payload so
 * we don't blow the context window on a preload.
 */
const SCRIPTING_SKILL_NEEDLES = [
  'hook',
  'script',
  'video-idea',
  'video idea',
  'short-form',
  'short form',
  'viral',
  'pacing',
  'cta',
  'pattern-interrupt',
];
const MAX_PRELOADED_SKILLS = 4;
const MAX_PRELOADED_SKILL_CHARS = 4000;
const MAX_PRELOADED_TOTAL_CHARS = 12_000;

async function loadScriptingSkillsBlock(admin: SupabaseClient): Promise<string> {
  try {
    const { data } = await admin
      .from('nerd_skills')
      .select('name, description, content, keywords')
      .eq('is_active', true);

    const rows = (data ?? []) as Array<{
      name: string;
      description: string | null;
      content: string | null;
      keywords: string[] | null;
    }>;
    if (rows.length === 0) return '';

    const matches = rows.filter((row) => {
      const haystack = [
        row.name ?? '',
        row.description ?? '',
        ...(row.keywords ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return SCRIPTING_SKILL_NEEDLES.some((needle) => haystack.includes(needle));
    });
    if (matches.length === 0) return '';

    const picked = matches.slice(0, MAX_PRELOADED_SKILLS);
    let budget = MAX_PRELOADED_TOTAL_CHARS;
    const parts: string[] = [];
    for (const skill of picked) {
      const body = (skill.content ?? '').replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
      if (!body) continue;
      const sliceLen = Math.min(MAX_PRELOADED_SKILL_CHARS, budget);
      if (sliceLen <= 0) break;
      const truncated = body.length > sliceLen ? `${body.slice(0, sliceLen)}\n\n[... truncated]` : body;
      const chunk = `## ${skill.name}\n\n${truncated}`;
      parts.push(chunk);
      budget -= chunk.length + 8; // + separator overhead
    }
    if (parts.length === 0) return '';

    return `\n\n---\n\n# AGENCY SCRIPTING FRAMEWORKS (preloaded for Strategy Lab)\n\nThese are Nativz's house frameworks for hooks, scripting, and short-form video. Use them as scaffolding for every script and idea you output in this session. Do not invent frameworks when these are available.\n\n${parts.join('\n\n---\n\n')}`;
  } catch (err) {
    console.warn('[strategy-lab-scripting-context] preload failed:', err);
    return '';
  }
}

/**
 * Build the full Strategy Lab addendum (behavioural rules + preloaded
 * scripting skills) to append to the base Nerd system prompt.
 */
export async function buildStrategyLabSystemAddendum(admin: SupabaseClient): Promise<string> {
  const skillsBlock = await loadScriptingSkillsBlock(admin);
  return STRATEGY_LAB_ADDENDUM + skillsBlock;
}
