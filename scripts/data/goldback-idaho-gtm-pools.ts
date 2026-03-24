/**
 * Idaho Goldback GTM copy — sourced from the Idaho Goldback Creative Brief (Goldback Creative & Marketing Teams, 02/04/26).
 * Headlines are drawn from the brief’s “Idaho Advertising” and national prospecting lists; subheads ladder up to RTB, pillars, and personas.
 * CTAs mirror goldback.com navigation labels.
 */

/** Overarching concept — must ladder all creative (brief). */
export const IDAHO_GOLDBACK_OVERARCHING_CONCEPT = 'SPEND GOLD. STAY FREE. KEEP IDAHO STRONG.';

/** Official Idaho brand positioning (brief). */
export const IDAHO_GOLDBACK_POSITIONING =
  "Idaho's trustworthy, spendable 24K gold currency — rooted locally and ready for the future.";

/**
 * Visual system for Gemini. Hex values below are for **your** color matching only — they are not ad copy and must never appear as pixels.
 */
export const IDGT_STYLE_DIRECTION_BASE =
  `ID GTM — gritty, industrious, classic (not glossy fintech). Campaign spine: ${IDAHO_GOLDBACK_OVERARCHING_CONCEPT} ` +
  'CRITICAL — NOTHING ON THE FINISHED AD MAY LOOK LIKE A STYLE GUIDE: ' +
  'No footer or header strip of color blocks. No swatch row. No “brand palette” or “color key” UI. ' +
  'No labels such as CREAM, MARIGOLD, LILYPAD, FOREST, or CHARCOAL printed as a legend. ' +
  'No hash-prefixed hex strings anywhere (do not paint # plus six hex digits on the artwork under any circumstance). ' +
  'TYPOGRAPHY: Headline in Ohno Fatface Compressed (ultra-bold, compressed, high contrast). Supporting line in a sturdy condensed serif. ' +
  'PHOTO GRADE: Stylized editorial — weathered, worn, warm; subtle grain and paper texture; natural Idaho-ish light. ' +
  'LOCKUP: Disciplined campaign slogan lockup — headline zone, at most one short supporting line, then a single CTA band. ' +
  'PRODUCT-FIRST: Idaho Goldback note(s) from the supplied reference photo must dominate the composition (~60–75% of visual interest). ' +
  'Show engraving, foil, serials, and series artwork clearly — generous product scale; gentle perspective ok; do not shrink the note to fit extra copy. ' +
  'LOGO / MARK: Use only the Goldback identity as it already appears printed on the supplied note (GB seal, wordmark, artwork on the bill). Do not invent a second logo, red “GOLD” badge, sticker, alternate monogram, or boxed mark beside the note. ' +
  'On-image marketing words = ONLY the exact headline, subheadline, and CTA strings quoted in the template (plus optional offer line if non-empty). ' +
  'Never paraphrase this modifier, never paste art-direction, and never use Product/service focus text as visible subhead or body copy — those blocks are instructions for you only. ' +
  'APPLY BRAND COLORS AS INVISIBLE-TO-VIEWER PAINT ONLY (backgrounds, gradients, type ink, shadows, button fill). ' +
  'Internal sRGB targets for matching (never render this sentence or these codes on the ad): cream eae2d3, marigold f2b03f, lilypad 91a673, forest 3a4a3f, charcoal 221710 — interpret as full hex in your pipeline but do not display. ' +
  'CTA: Exactly one primary **button** (filled or outline) labeled verbatim with the provided CTA text (default: “Learn more”). ' +
  'Product must match attached reference photography — same note art, denomination, and perspective.';

/** Site-aligned CTAs (sentence case); keep ≤30 chars for optional batch fields. */
export const IDGT_CTAS = [
  'Learn more',
  'Find a seller',
  'Open the safe',
  'Where to buy',
  'Where to spend',
  'Become a merchant',
  'Find a distributor',
  'Why accept Goldbacks',
  'About Goldbacks',
  'About us',
  'Idaho LER program',
  'Download the app',
] as const;

export const IDGT_OFFERS = [
  '',
  'Limited Early Release',
  'New Idaho series',
  'Gem State debut',
  'While supplies last',
  IDAHO_GOLDBACK_OVERARCHING_CONCEPT,
  'Real 24K. Verifiable.',
  'Circulate local',
] as const;

/**
 * Shown to the model as product context only — must stay factual / customer-facing (no layout or art-direction words).
 */
export const IDGT_PRODUCT_LINES = [
  IDAHO_GOLDBACK_POSITIONING,
  'Idaho Goldbacks — trustworthy, verifiable 24K gold currency rooted in Idaho places and stories.',
  'Practical denominations and a growing network of Idaho merchants.',
  'Physical notes with serials, detailed artwork, and built-in security features.',
  'Neighbor-to-neighbor and Main Street circulation across Idaho.',
  'Precision gold layer, unique serials, and advanced anti-counterfeiting engineering.',
] as const;

/**
 * Approved headlines from the brief (Idaho Advertising by persona + national / prospecting).
 * Parenthetical channel tags from the Word doc are omitted.
 */
export const IDAHO_BRIEF_APPROVED_HEADLINES = [
  'Money built for any adventure.',
  'Money that can weather any storm.',
  'Set your sights on sound money.',
  'Hard money for hard country.',
  'Modern tech. Traditional money.',
  'Prepare your wallet for anything.',
  'Built for neighbor-to-neighbor transactions.',
  'Trust it. Hold it. Spend it.',
  'Gold engineered to circulate.',
  'Your home. Your land. Your gold.',
  'Currency as off grid as the Sawtooths.',
  'Currency as off grid as you are.',
  'Go off grid with Goldbacks.',
  'Hard money. Zero dependence.',
  'Gold currency. No bank required.',
  'Future-ready 24k gold currency.',
  'Hard-earned money, backed by gold.',
  'A currency you can trust.',
  'Keep gold circulating in Idaho.',
  'Gold currency, now in Idaho. Pass it on.',
  'Built for Main Street, not Wall Street.',
  'Spend gold where Idaho does business.',
  'Innovation, backed by 24k gold.',
  'Gold currency for a changing economy.',
  'Gold engineered for your wallet.',
  'The future of currency, now in Idaho.',
  "Idaho's future looks golden.",
  'Gold for the modern world.',
  'Hard money for a hard country.',
  'Precision-built currency for a changing economy.',
  'Get in the gold rush sooner.',
] as const;

