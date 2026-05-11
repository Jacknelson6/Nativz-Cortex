/**
 * Curated viral short-form formats library (NAT-64).
 *
 * Each entry is a *format*, not a topic. The point is: a format describes a
 * repeatable visual / structural pattern that has demonstrated viral
 * performance across niches. A strategist drops a brand into one of these
 * shapes and gets a known-winning structure to fill in.
 *
 * Source-of-truth question (still open): today this is hand-curated. Future
 * iterations could pull from a DB table fed by manual curation + automated
 * scoring of top short-form posts. For v0.1 the constants live here so the
 * /finder/formats page renders something real on day one.
 */

export type FormatRowCategory =
  | 'recommended'
  | 'hooks'
  | 'education'
  | 'narrative'
  | 'pov'
  | 'transformation'
  | 'trends';

export interface ViralFormat {
  /** Stable slug, used for routing into a future detail page. */
  id: string;
  /** Short, scannable title. */
  title: string;
  /** One-line description of the structural pattern. */
  description: string;
  /** Concrete example of the format in action (anonymized). */
  example: string;
  /** Why this works (the psychology / mechanic). */
  whyItWorks: string;
  /** Steps a creator runs through to recreate the format. */
  recreationSteps: string[];
  /** The row this format appears in on the explore page. */
  category: FormatRowCategory;
  /** Industries the format ports cleanly into. Used by the
   *  "Recommended for [brand]" row. Leave empty to mean "any niche". */
  industries: string[];
  /** Approximate run time in seconds. Short-form caps at ~90s. */
  durationSeconds: number;
  /** Production complexity: 1 = phone + nothing, 5 = multi-day shoot. */
  complexity: 1 | 2 | 3 | 4 | 5;
}

export const VIRAL_FORMATS: ViralFormat[] = [
  // ---------------------------------------------------------------------- //
  // HOOKS
  // ---------------------------------------------------------------------- //
  {
    id: 'pattern-interrupt-hook',
    title: 'Pattern interrupt opener',
    description: 'Lead with a visual that breaks expected feed cadence.',
    example: 'Hand drops a brick on a window. Cut to: "this is what tempered glass looks like under impact."',
    whyItWorks: 'The first 0.5s decides retention. A visual that does not fit feed-norms forces the brain to stay and resolve the surprise.',
    recreationSteps: [
      'Pick the most counter-intuitive visual you can stage with the product',
      'Open on the visual at full frame, no logo, no caption',
      'Resolve the surprise within 3 seconds',
      'Pivot into the actual story / product point',
    ],
    category: 'hooks',
    industries: ['home services', 'ecommerce', 'fitness', 'food'],
    durationSeconds: 30,
    complexity: 2,
  },
  {
    id: 'wait-for-it-hook',
    title: 'Wait-for-it tension build',
    description: 'On-screen text promises a payoff, action plays out across the clip.',
    example: 'Text overlay: "watch what happens when this window catches a baseball." Slow-mo windup, hit, glass holds.',
    whyItWorks: 'The promise creates an obligation to keep watching. Skipping feels like quitting.',
    recreationSteps: [
      'Identify a 5-15s product moment with a clear result',
      'Stamp a curiosity-gap text overlay in the first frame',
      'Let the action play with minimal cuts',
      'Pay off the promise visually before the 12-second mark',
    ],
    category: 'hooks',
    industries: [],
    durationSeconds: 18,
    complexity: 1,
  },
  {
    id: 'unpopular-opinion-hook',
    title: 'Unpopular opinion lead',
    description: 'Open with a contrarian claim, defend it across the clip.',
    example: '"Replacing your windows is the dumbest home upgrade you can make. Unless..."',
    whyItWorks: 'Contradicting a default belief activates the reader. Comments and saves spike.',
    recreationSteps: [
      'Find a category default belief',
      'State the inverse in first person on camera',
      'Spend the body explaining the one condition under which the inverse is true',
      'Land on the brand-friendly nuance',
    ],
    category: 'hooks',
    industries: ['home services', 'finance', 'fitness', 'b2b'],
    durationSeconds: 40,
    complexity: 1,
  },

  // ---------------------------------------------------------------------- //
  // EDUCATION
  // ---------------------------------------------------------------------- //
  {
    id: 'three-tier-comparison',
    title: 'Good / better / best breakdown',
    description: 'Three-step ladder showing escalating quality of a thing.',
    example: '"$200 windows vs $800 windows vs $2000 windows" with frame-shake test on each.',
    whyItWorks: 'Categories satisfy the urge to mentally classify. Viewers self-place into a tier and feel informed enough to share.',
    recreationSteps: [
      'Pick three real product / service tiers',
      'Run the same test or scenario on each',
      'Edit as a clean three-act sequence with consistent framing',
      'Land on the recommendation without selling hard',
    ],
    category: 'education',
    industries: ['home services', 'ecommerce', 'fitness', 'food'],
    durationSeconds: 45,
    complexity: 3,
  },
  {
    id: 'reverse-engineer-explainer',
    title: 'Reverse-engineer the result',
    description: 'Show the finished product first, then walk back through how it got built.',
    example: 'Open on a finished kitchen renovation. Cut backwards through framing, demo, original kitchen.',
    whyItWorks: 'Starting from the payoff banks attention. Watching the build in reverse satisfies the "how did they do that" itch.',
    recreationSteps: [
      'Capture every stage of the project as it happens',
      'Open on the final frame held for 1-2 seconds',
      'Reverse-cut through 4-6 milestone moments',
      'Land on the "before" with a one-line voiceover summary',
    ],
    category: 'education',
    industries: ['home services', 'fitness', 'food'],
    durationSeconds: 35,
    complexity: 2,
  },
  {
    id: 'myth-vs-fact',
    title: 'Myth vs fact split-screen',
    description: 'Split frame: common belief on one side, the truth on the other.',
    example: '"Bay windows look great" vs "bay windows leak heat" with thermal camera footage.',
    whyItWorks: 'Direct comparison short-circuits the "do my own research" loop. Viewers screenshot the side-by-side.',
    recreationSteps: [
      'List the top 3 myths in your category',
      'Pick the one with the most visual disprover',
      'Shoot both sides with identical framing',
      'Edit as a static split, no transitions',
    ],
    category: 'education',
    industries: ['home services', 'fitness', 'finance', 'b2b'],
    durationSeconds: 25,
    complexity: 2,
  },

  // ---------------------------------------------------------------------- //
  // NARRATIVE
  // ---------------------------------------------------------------------- //
  {
    id: 'customer-story-vignette',
    title: 'Customer story vignette',
    description: '60-second arc of a real customer journey from problem to outcome.',
    example: '"The Hendersons had a 1980s sliding glass door. Every winter their heating bill ran $400+. Then..."',
    whyItWorks: 'Stories about specific named people defeat the "this is just an ad" reflex.',
    recreationSteps: [
      'Pick a customer with a strong before/after',
      'Open with a single line establishing them as a real person',
      'Show the problem with on-the-ground footage',
      'Cut to the solution and the outcome metric',
    ],
    category: 'narrative',
    industries: ['home services', 'finance', 'b2b'],
    durationSeconds: 55,
    complexity: 3,
  },
  {
    id: 'ride-along',
    title: 'Crew ride-along',
    description: 'POV from the crew vehicle through a normal day on the job.',
    example: 'Phone clipped to dashboard. Cuts: "drive to job", "first measurement", "lunch", "install", "client reaction".',
    whyItWorks: 'Behind-the-scenes content normalizes the buying decision. The crew becomes a character viewers root for.',
    recreationSteps: [
      'Mount a phone in the lead crew vehicle for one workday',
      'Capture 5-7 narrative beats throughout the day',
      'Edit as casual cinéma vérité, voiceover not required',
      'End on the customer reaction shot',
    ],
    category: 'narrative',
    industries: ['home services'],
    durationSeconds: 60,
    complexity: 2,
  },

  // ---------------------------------------------------------------------- //
  // POV
  // ---------------------------------------------------------------------- //
  {
    id: 'pov-first-day',
    title: 'POV: your first day',
    description: 'Audience is placed inside the customer\'s point of view at moment of decision.',
    example: '"POV: you just bought a 1970s house and you are walking through it for the first time."',
    whyItWorks: 'POV framing turns a passive scroll into an imaginative simulation. Engagement spikes from comments along the lines of "this is literally me."',
    recreationSteps: [
      'Pick the customer journey moment where stakes are highest',
      'Open with "POV:" overlay, lock the camera in first-person',
      'Walk through the moment with no third-person cutaways',
      'End on the implicit decision the viewer would make',
    ],
    category: 'pov',
    industries: ['home services', 'fitness', 'finance', 'food'],
    durationSeconds: 30,
    complexity: 1,
  },
  {
    id: 'pov-on-the-job',
    title: 'POV: a day in this job',
    description: 'First-person view through the operator\'s shift.',
    example: '"POV: I\'m an installer and these are the 5 weirdest things I see in homes every week."',
    whyItWorks: 'Insider POV is one of the highest-saving short-form formats. Viewers screenshot the list.',
    recreationSteps: [
      'Pick a role on your team with high public curiosity',
      'Open in POV with a one-line setup',
      'Run a numbered list (3-5 items) of authentic observations',
      'Land with the most surprising one as the closer',
    ],
    category: 'pov',
    industries: ['home services', 'b2b'],
    durationSeconds: 45,
    complexity: 1,
  },

  // ---------------------------------------------------------------------- //
  // TRANSFORMATION
  // ---------------------------------------------------------------------- //
  {
    id: 'before-after-stack',
    title: 'Before / after image stack',
    description: 'Static or near-static side-by-side, held long enough to read.',
    example: '"Same window, 24 hours apart. Spot the upgrade." Slow zoom across both.',
    whyItWorks: 'Transformations are share-bait. Viewers DM the post to people considering the same upgrade.',
    recreationSteps: [
      'Capture before from the exact angle you plan to shoot after',
      'Hold the before for 2-3 seconds with no caption',
      'Cut to after held identically',
      'Add a single overlay line on the second frame',
    ],
    category: 'transformation',
    industries: ['home services', 'fitness', 'food'],
    durationSeconds: 12,
    complexity: 1,
  },
  {
    id: 'time-lapse-build',
    title: 'Time-lapse the install',
    description: 'Compress hours of work into 15 seconds of speed-ramped footage.',
    example: 'Tripod in living room, lights on, 8-hour install compressed to a 15-second blur ending on a clean reveal.',
    whyItWorks: 'Watching slow craft compressed scratches a satisfaction itch and builds implicit trust in the work.',
    recreationSteps: [
      'Set a tripod with full job-site visibility',
      'Capture at one frame every 5-10 seconds',
      'Speed ramp into the reveal, drop speed in the final 2 seconds',
      'Closing line: total time + brand mark',
    ],
    category: 'transformation',
    industries: ['home services', 'food'],
    durationSeconds: 18,
    complexity: 2,
  },

  // ---------------------------------------------------------------------- //
  // TRENDS
  // ---------------------------------------------------------------------- //
  {
    id: 'trending-audio-overlay',
    title: 'Trending audio + brand context',
    description: 'Drop a current trending sound under brand-specific b-roll.',
    example: 'Whatever audio is in the top 5 this week, layered over your highest-quality brand b-roll.',
    whyItWorks: 'Algorithmically-favored audio pushes the post to viewers who have engaged with the trend, expanding reach beyond the brand\'s usual audience.',
    recreationSteps: [
      'Check the platform trending audio chart on the morning of post day',
      'Pick the audio whose vibe matches your b-roll, not the other way around',
      'Cut beats to the audio peaks',
      'Avoid lip-sync unless your brand voice supports it',
    ],
    category: 'trends',
    industries: [],
    durationSeconds: 20,
    complexity: 1,
  },
  {
    id: 'green-screen-react',
    title: 'Green-screen react',
    description: 'On-camera reaction to a screenshot or news clip behind the host.',
    example: 'Owner reacts to a competitor\'s ad with running commentary.',
    whyItWorks: 'Reaction format is conversational; viewers feel like they are watching with a friend.',
    recreationSteps: [
      'Pick a piece of public content relevant to your category',
      'Stand in front of green screen / IG green-screen filter',
      'Pause-react every 3-5 seconds, never let the source play uninterrupted',
      'Close with your honest take',
    ],
    category: 'trends',
    industries: ['home services', 'fitness', 'finance', 'b2b', 'food', 'ecommerce'],
    durationSeconds: 35,
    complexity: 1,
  },
];

/**
 * Map a row category to its display label and short blurb.
 */
export const ROW_LABELS: Record<FormatRowCategory, { title: string; blurb: string }> = {
  recommended: {
    title: 'Recommended for you',
    blurb: 'Formats that fit the active brand based on industry and category.',
  },
  hooks: {
    title: 'Scroll-stopping hooks',
    blurb: 'Openers that keep watch time above 60% retention.',
  },
  education: {
    title: 'Education formats',
    blurb: 'Teach-and-pivot structures that keep viewers and convert later.',
  },
  narrative: {
    title: 'Story formats',
    blurb: '30-60s arcs that turn brand context into a cinematic moment.',
  },
  pov: {
    title: 'POV formats',
    blurb: 'First-person framings that pull viewers inside the experience.',
  },
  transformation: {
    title: 'Transformation formats',
    blurb: 'Before/after structures that travel well on shares and saves.',
  },
  trends: {
    title: 'Trend-leveraging formats',
    blurb: 'Mechanics that ride algorithmic favor without feeling cringe.',
  },
};

/**
 * Pick formats relevant to a brand based on its industry tags. When the
 * brand has no industry context yet, fall back to the universally-applicable
 * formats (`industries: []`) so the row is never empty.
 */
export function recommendedForBrand(brandIndustries: string[]): ViralFormat[] {
  const lc = brandIndustries.map((s) => s.toLowerCase());
  const matches = VIRAL_FORMATS.filter((f) => {
    if (f.industries.length === 0) return true;
    return f.industries.some((i) => lc.includes(i.toLowerCase()));
  });
  return matches.slice(0, 8);
}
