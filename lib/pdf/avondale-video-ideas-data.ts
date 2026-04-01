/**
 * Avondale — 50 video ideas with report-sourced insight bullets.
 * Reports: (1) Passive income through private lending real estate
 *          (2) Fix and flip construction lending
 * Themes align with Cortex discussion: how-tos, explainers, plain language,
 * partner messaging, anxiety reduction, draw/scope, deal teardown (agnostic).
 */

export type AvondaleReportLane =
  | 'Passive income through private lending real estate'
  | 'Fix and flip construction lending';

export interface AvondaleVideoIdea {
  title: string;
  report: AvondaleReportLane;
  /** Insight bullets tied to report research + strategy call */
  insights: string[];
}

export const AVONDALE_VIDEO_IDEAS: AvondaleVideoIdea[] = [
  {
    title: 'What passive income means in private lending (without being a landlord)',
    report: 'Passive income through private lending real estate',
    insights: [
      'Investor-facing education outperforms product pitches when audiences are still learning the category.',
      'Plain-language definitions rank with how-to and explainer formats in cross-platform engagement patterns.',
    ],
  },
  {
    title: 'Secured note vs. unsecured: why collateral matters in 60 seconds',
    report: 'Passive income through private lending real estate',
    insights: [
      'Risk framing is a top investor concern; short explainers reduce drop-off vs. dense compliance talk.',
      'Checklist-style structure (what is secured, what is not) matches high-performing “how it works” content.',
    ],
  },
  {
    title: 'How a private lending investor typically gets paid (simple timeline)',
    report: 'Passive income through private lending real estate',
    insights: [
      'Distribution mechanics are a frequent search intent; answering directly supports partner-not-sales tone.',
      'Walkthrough formats keep retention higher than abstract thought leadership for novice viewers.',
    ],
  },
  {
    title: 'Risk in plain English: what can go wrong and how it is mitigated',
    report: 'Passive income through private lending real estate',
    insights: [
      'Addressing anxiety head-on (funding, documentation, timelines) matches emotional breakdowns seen in category content.',
      'Transparency builds trust faster than rate-only messaging for skeptical scrollers.',
    ],
  },
  {
    title: 'Diversification: why many small positions beat one big bet',
    report: 'Passive income through private lending real estate',
    insights: [
      'Portfolio thinking resonates with passive-income seekers comparing alternatives.',
      'Educational series allow you to repeat core ideas with fresh scripts—key for avoiding audience fatigue.',
    ],
  },
  {
    title: 'Due diligence checklist: questions to ask before wiring funds',
    report: 'Passive income through private lending real estate',
    insights: [
      'Checklists are among the strongest-performing formats in scraped social data for lending education.',
      'Turns abstract “trust us” into repeatable steps—aligned with partner-oriented positioning.',
    ],
  },
  {
    title: 'Red flags in any private lending pitch (stay safe, stay smart)',
    report: 'Passive income through private lending real estate',
    insights: [
      'Objection-style hooks (“too good to be true”) capture curiosity plus anxiety in feed behavior.',
      'Protective education is highly shareable among peer investor networks.',
    ],
  },
  {
    title: 'What happens if a loan goes sideways (calm, high-level walkthrough)',
    report: 'Passive income through private lending real estate',
    insights: [
      'Fear of loss is a driver of anxiety; naming the process reduces phantom worst-case assumptions.',
      'Keeps you credible without sensationalizing—important for brand-consistent tone.',
    ],
  },
  {
    title: 'Interest vs. “bank CD”: apples-to-oranges explained',
    report: 'Passive income through private lending real estate',
    insights: [
      'Comparisons meet viewers where they are (bank products) and migrate them to private lending concepts.',
      'Short analogies fit explainer cadence recommended for novice audiences.',
    ],
  },
  {
    title: 'Self-directed retirement + private lending (conceptual overview)',
    report: 'Passive income through private lending real estate',
    insights: [
      'Retirement capital is a common passive-income use case; disclaimers + education pair well.',
      'Positions Avondale as guide, not tax advisor—matches “partner” messaging.',
    ],
  },
  {
    title: 'Minimum ticket sizes: what they imply for liquidity and concentration',
    report: 'Passive income through private lending real estate',
    insights: [
      'Concrete numbers outperform vague “reach out” CTAs in retention metrics for finance education.',
      'Helps investors self-segment before they call—saves time for your team.',
    ],
  },
  {
    title: 'Geographic focus: why some lenders stay in certain metros',
    report: 'Passive income through private lending real estate',
    insights: [
      'Local expertise is a differentiator vs. national aggregators with weak context.',
      'Supports “educate the market you serve” without hard selling.',
    ],
  },
  {
    title: 'Sponsor strength: what borrower track record actually looks like',
    report: 'Passive income through private lending real estate',
    insights: [
      'Underwriting logic is opaque to outsiders; demystifying it builds investor confidence.',
      'Pairs with partner narrative: you are evaluating deals, not chasing transactions.',
    ],
  },
  {
    title: 'LTV in 60 seconds (with a simple property graphic)',
    report: 'Passive income through private lending real estate',
    insights: [
      'Visual explainers rank high for saving rate; LTV is a core investor vocabulary term.',
      'Modular “one concept per video” supports a passive-income playlist.',
    ],
  },
  {
    title: 'First-position debt: plain language, no Wall Street jargon',
    report: 'Passive income through private lending real estate',
    insights: [
      'Terminology videos reduce confusion—a emotion paired with curiosity in category analysis.',
      'Feeds search intent for “private lending basics” and suggested-profile discovery on platforms.',
    ],
  },
  {
    title: 'Why documentation quality protects investors and borrowers alike',
    report: 'Passive income through private lending real estate',
    insights: [
      'Documentation anxiety shows up in borrower content too; investors benefit from knowing why it matters.',
      'Reinforces operational rigor without fear-mongering.',
    ],
  },
  {
    title: '“Is this too good to be true?” — how to sanity-check a deal',
    report: 'Passive income through private lending real estate',
    insights: [
      'Directly addresses skepticism—strong hook pattern for cold audiences.',
      'Complements objection handling on cash vs. leverage elsewhere in the calendar.',
    ],
  },
  {
    title: 'Rates moved: what it means for passive investors (careful news tie-in)',
    report: 'Passive income through private lending real estate',
    insights: [
      'News and market commentary can work when scripted for value, not noise.',
      'Positions Avondale as current without chasing volatility for clicks.',
    ],
  },
  {
    title: 'Partner, not product: how relationship underwriting shows up for investors',
    report: 'Passive income through private lending real estate',
    insights: [
      'Partner-oriented messaging was explicitly called out as working in Cortex research.',
      'Differentiates from “rate sheet” competitors in local markets.',
    ],
  },
  {
    title: 'Liquidity reality: private lending vs. public markets (expectations reset)',
    report: 'Passive income through private lending real estate',
    insights: [
      'Sets appropriate expectations—reduces downstream frustration and support load.',
      'Adult, calm tone matches brand voice for high-stakes money topics.',
    ],
  },
  {
    title: 'Anonymous case: “Deal A” structure, outcome, lesson (no names)',
    report: 'Passive income through private lending real estate',
    insights: [
      'Deal-style stories perform when anonymized—educational without exposing parties.',
      'Mirrors “deal teardown” direction discussed for borrower content, adapted for investors.',
    ],
  },
  {
    title: 'FAQ rapid-fire: top investor questions from search and comments',
    report: 'Passive income through private lending real estate',
    insights: [
      'FAQ formats map to recurring questions (“how fast,” “what documents”) surfaced in research.',
      'Phone-in-hand or comment-overlay styles are easy to batch on shoot days.',
    ],
  },
  {
    title: 'Anxiety hook: “Will my capital be safe if the market shifts?”',
    report: 'Passive income through private lending real estate',
    insights: [
      'Category content skews anxious; naming fear and answering calmly is a proven pattern.',
      'Works as a standalone hook or ad-style organic test later.',
    ],
  },
  {
    title: 'Why we care about exit strategy before we care about interest rate',
    report: 'Passive income through private lending real estate',
    insights: [
      'Reframes “rate shopping” into underwriting discipline—investor-grade thinking.',
      'Supports longer watch time than a single headline number.',
    ],
  },
  {
    title: 'Building a passive-income lane alongside active projects (mental model)',
    report: 'Passive income through private lending real estate',
    insights: [
      'Speaks to hybrid audiences (builders who also deploy capital)—crossover with borrower ICP.',
      'Expands content without abandoning core pillars—slow bleed of new themes.',
    ],
  },
  {
    title: 'Borrow to build, part 1: what is a draw schedule?',
    report: 'Fix and flip construction lending',
    insights: [
      'Draw schedules surfaced as a trending, high-resonance topic in fix-and-flip lending research.',
      'Anchor for a multi-part explainer series from basics to advanced—requested on strategy call.',
    ],
  },
  {
    title: 'What triggers a construction draw (milestones, inspections, paperwork)',
    report: 'Fix and flip construction lending',
    insights: [
      'How-to and checklist formats lead engagement in scraped creator data for this lane.',
      'Reduces “hidden disbursement” confusion by showing the actual sequence.',
    ],
  },
  {
    title: 'Scope clarity: why vague scopes stall draws—and how to fix them',
    report: 'Fix and flip construction lending',
    insights: [
      'Scope clarity was flagged among topics with strong audience resonance.',
      'Practical builder advice pairs with walk-and-talk or site footage.',
    ],
  },
  {
    title: 'Change orders vs. scope creep: what the lender needs to see',
    report: 'Fix and flip construction lending',
    insights: [
      'Operational fragility (misaligned scope) drives anxiety; clarity is the antidote.',
      'Positions Avondale as experienced partner managing project risk.',
    ],
  },
  {
    title: 'Hidden disbursement risk in fix-and-flip loans (explained simply)',
    report: 'Fix and flip construction lending',
    insights: [
      'Explicitly called out in Cortex trending topics for this report.',
      'Plain-language explainers outperform jargon-heavy competitor content.',
    ],
  },
  {
    title: 'Timeline truth: application to close to first draw (realistic ranges)',
    report: 'Fix and flip construction lending',
    insights: [
      'Speed questions are frequent; pairing speed with requirements sets honest expectations.',
      'Helps when shoots cancel—evergreen desk or office explainer.',
    ],
  },
  {
    title: 'Documents that slow deals down—and how to prep them upfront',
    report: 'Fix and flip construction lending',
    insights: [
      'Documentation mistakes were noted as a source of “will funding stall?” anxiety.',
      'Checklist format = high save/share potential among builders.',
    ],
  },
  {
    title: 'ARV vs. as-is: what construction lenders align on before ground breaks',
    report: 'Fix and flip construction lending',
    insights: [
      'Valuation basics are a top funnel topic for novice flippers—matches “start at square one” ask.',
      'Supports education ladder from basic to complex.',
    ],
  },
  {
    title: 'Why fast funding still requires clean paperwork (speed + discipline)',
    report: 'Fix and flip construction lending',
    insights: [
      'Resolves tension between “48-hour” narratives and underwriting reality—trust building.',
      'Partner framing: we move fast when the file is tight.',
    ],
  },
  {
    title: 'We are not here to sell—we are here to underwrite with you (partner tone)',
    report: 'Fix and flip construction lending',
    insights: [
      'Partner-oriented messaging consistently surfaced as effective in Cortex analysis.',
      'Differentiates from transactional “loan amount” still-image competitors.',
    ],
  },
  {
    title: 'Site walk: three things that make a property lender-ready',
    report: 'Fix and flip construction lending',
    insights: [
      'Walk-and-talk on active jobs was recommended to blend education with proof.',
      'Visual storytelling sustains retention better than talking-head-only when possible.',
    ],
  },
  {
    title: 'First-time builder mistakes that delay draws (scheduling, subs, permits)',
    report: 'Fix and flip construction lending',
    insights: [
      'Targets novice builders in premium neighborhoods—strategic audience discussed on call.',
      'Practical pain points drive comments and saves.',
    ],
  },
  {
    title: '“I could pay cash…” — when leverage still wins for builders',
    report: 'Fix and flip construction lending',
    insights: [
      'Objection handling for viewers on the fence—explicitly recommended in strategy discussion.',
      'Debt-in-a-capital-stack angle supports multiple deals vs. one cash deployment.',
    ],
  },
  {
    title: 'Debt in a capital stack: moving faster with dry powder for the next deal',
    report: 'Fix and flip construction lending',
    insights: [
      'Leverage explanation connects to “borrow to build” growth narrative.',
      'Educates without triggering hard-left pivots from current content pillars.',
    ],
  },
  {
    title: 'FAQ rapid-fire: speed, docs, fees, timeline (comments on screen)',
    report: 'Fix and flip construction lending',
    insights: [
      'Maps to recurring borrower questions identified in research (how fast, what documents).',
      'Easy batch format for reshoots with fresh hooks.',
    ],
  },
  {
    title: 'Deal teardown (anonymous): numbers + region, no address or builder name',
    report: 'Fix and flip construction lending',
    insights: [
      'Deal teardown series validated as educational and agnostic—reduces disclosure risk.',
      'Storytelling + optional map/graphics overlay increases watch-through.',
    ],
  },
  {
    title: 'Five green flags that made this construction loan “clean”',
    report: 'Fix and flip construction lending',
    insights: [
      'Positive pattern recognition teaches underwriting without exposing private details.',
      'Pairs with partner messaging and long-term borrower relationships.',
    ],
  },
  {
    title: 'One doc mistake that almost stalled a draw (lesson only, anonymized)',
    report: 'Fix and flip construction lending',
    insights: [
      'Operational fragility and documentation anxiety are core themes in emotional analysis.',
      'Specificity increases credibility vs. generic tips.',
    ],
  },
  {
    title: '“Will funding disappear mid-rehab?” — how process reduces that fear',
    report: 'Fix and flip construction lending',
    insights: [
      'Directly addresses anxiety drivers: staying funded, draw approvals, documentation errors.',
      'Calm reassurance outperforms hype for high-stakes borrowers.',
    ],
  },
  {
    title: 'Draw approval anxiety: what actually delays vs. what does not',
    report: 'Fix and flip construction lending',
    insights: [
      'Separates myth from process—reduces comment-section spirals.',
      'Supports consistent messaging across sales and social.',
    ],
  },
  {
    title: 'Neighborhood strategy: why certain pockets offer higher upside',
    report: 'Fix and flip construction lending',
    insights: [
      'Strategic geography discussion was highlighted for aspirational builders.',
      'Keep educational—not a flex—per brand guardrails from the call.',
    ],
  },
  {
    title: 'Market moment: what headlines mean for local builders (value-first)',
    report: 'Fix and flip construction lending',
    insights: [
      'News commentary works when scripted to add local builder value—not panic.',
      'Lower engagement than how-tos but strong for authority when used sparingly.',
    ],
  },
  {
    title: 'Borrower interview: what you wish you knew before your first build',
    report: 'Fix and flip construction lending',
    insights: [
      'Interview-style borrower content called out as strong when schedules align.',
      'Social proof without scripted sales talk.',
    ],
  },
  {
    title: 'From the truck: 45 seconds—one lesson per job-site visit',
    report: 'Fix and flip construction lending',
    insights: [
      'Short verticals fit between longer explainers; keeps feed fresh.',
      'Uses real environments when full walkthroughs are not possible.',
    ],
  },
  {
    title: 'Series trailer: “Borrow to build” playlist—from draws to advanced strategy',
    report: 'Fix and flip construction lending',
    insights: [
      'Series packaging increases binge watch and educates algorithm on your niche.',
      'Aligns with bi-weekly call recommendation for structured education ladder.',
    ],
  },
];
