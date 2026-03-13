/**
 * Temporary script: Bulk import historical Fyxer meetings into client knowledge bases.
 * Run: export $(grep -v '^#' .env.local | grep -E '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|GOOGLE_AI_STUDIO_KEY)=' | xargs) && npx tsx scripts/import-historical-meetings.ts
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GOOGLE_AI_KEY = process.env.GOOGLE_AI_STUDIO_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Client ID mapping
// ---------------------------------------------------------------------------
const CLIENTS: Record<string, string> = {
  toastique: '22bb761f-4fb6-41ec-ac73-e13693e74c12',
  ecoview: '724c4a91-915f-4a81-bca2-64219f66e87c',
  landshark: 'c21e5c9a-4d4a-41ce-9e80-bbb7ee6ef429',
  hartley: '70f721e1-1f74-42d8-b7fd-9805e851f10b',
  crystal_creek: 'dfb1b47c-a045-425e-9379-80b5675cc796',
  weston: '8013e014-7738-4f1c-af32-40ae59a446ad',
  safe_stop: '4793c503-8f63-4c93-82ee-1b1503fdd1c7',
  equidad: 'bff1c672-14a9-46cc-8c53-b6f71b51c851',
  kumon: '8617f693-eabd-4268-88f5-1bfaa659ef05',
  rana: '81584bba-5331-4a38-8a92-82c0e30eeae5',
};

// ---------------------------------------------------------------------------
// Meeting data — 28 new meetings to import
// ---------------------------------------------------------------------------
interface MeetingData {
  fyxer_id: string;
  client_key: string;
  title: string;
  meeting_date: string;
  content: string;
}

const MEETINGS: MeetingData[] = [
  // ── EcoView (4 meetings) ──
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:750td23s5drkqoublt4rmb107e_20251215T163000Z',
    client_key: 'ecoview',
    title: 'EcoView x Nativz / Bi-Weekly Marketing Meeting',
    meeting_date: '2025-12-15',
    content: `## Lead Flow & CRM Launch
- New CRM (Lead Perfection) + channel automation launching Jan 5–6
- Self-booking links will be sent via text and email for new leads
- Duda conditional-logic plugin will validate zip codes on forms
- Recent lead quality issues driven by out-of-area and invalid contact details (73 leads, 5 appointments since Dec 1)

## Advertising Performance & Attribution
- Website key events +187%; Google ad conversions +91%; cost per conversion down 49%
- Facebook quantity +160%; Facebook CPL down 71%; observed CPL range $47–$74
- Full attribution depends on Lead Perfection integration limits

## Social Creative Strategy
- Meta Andromeda requires high-volume, varied macro creative testing
- Priority: multiple, localized creative units (city/neighborhood level)
- Focused hooks: "3 signs you need new windows", fogged glass, measurement responsibility

## Next Steps
- Finish Sudo conditional form and CRM integration
- Confirm under-35 targeting fully turned off across ad sets
- Monitor CPL, lead quality and CPM daily through January`,
  },
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:750td23s5drkqoublt4rmb107e_20251229T163000Z',
    client_key: 'ecoview',
    title: 'EcoView x Nativz / Bi-Weekly Marketing Meeting',
    meeting_date: '2025-12-29',
    content: `## Performance Overview
- Lead volume down in December; sales dollars flat YoY but Austin inflates total
- 2,084,000 views across Facebook, Instagram and YouTube since Oct 1
- Instagram link clicks ~7,500 (up 218%); profile visits up 363%
- Ad account moved to new account; CPM decreased and CTR improved; 44 ads in rotation

## CRM & Lead Quality
- Paperform being built with conditional logic to capture zip and block bots
- CRM go-live planned around Jan 5–6

## Ad Targeting
- Prioritize 35+/40+ demographic; eliminate under-35 targeting
- TikTok: content cross-posted only (no ad spend); plan to start new account

## Content Strategy
- Content pillars: talking-head, ASMR/satisfying, and meme style
- Talking-head and videos featuring Alyssa are top performers for conversions`,
  },
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:750td23s5drkqoublt4rmb107e_20260112T163000Z',
    client_key: 'ecoview',
    title: 'EcoView x Nativz / Bi-Weekly Marketing Meeting',
    meeting_date: '2026-01-12',
    content: `## Waco–Temple Territory Setup
- New Waco–Temple territory covering Waco through Colleen, bordering Austin at Georgetown
- Use "Waco–Temple area" phrasing for localized social copy and scripts
- Create a dedicated landing page for the Waco–Temple territory

## Creative & Content Plan
- Use existing window replacement footage with voiceover to localize messaging
- On-site filming requested; drone and Jamie coordination planned

## Paid Media Budget & Allocation
- Current monthly spend: $7,500 Dallas, $2,500 Austin
- Consider increasing Austin budget to $3,500–$4,000 if approved

## Launch Timing
- New sales hire starts training Tuesday Jan 20; appointments targeted same weekend
- Separate spend allocated to new territory for early testing`,
  },
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:750td23s5drkqoublt4rmb107e_20260126T163000Z',
    client_key: 'ecoview',
    title: 'EcoView x Nativz / Bi-Weekly Marketing Meeting',
    meeting_date: '2026-01-26',
    content: `## Business Lead Update
- Waco Temple area leads have started arriving; early signs of demand
- Start of year lead volume was unusually slow across all locations
- Cold weather expected to increase window-replacement interest

## Social Media Performance
- 817,392 video views month-to-date; on pace for ~1,000,000 by month end
- ~500,000 views from Facebook (up 21% vs December); ~250,000+ from Instagram (up 46%)
- Facebook gained ~439 followers; Instagram nearing 1,000 followers

## Creative & Shoots
- New cold-weather creative requested: single-pane windows causing home heat loss
- Hartley shoot postponed; new date scheduled for February

## Ads, Billing, And CRM
- Waco and Austin/Temple campaigns launched; performance and cost-per-result look healthy
- MarketSharp reinstated for production CRM; HubSpot evaluation tabled`,
  },

  // ── Crystal Creek Cattle (3 meetings) ──
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:kojf53mp58797pkpdafu1j05dh_20251216T170000Z',
    client_key: 'crystal_creek',
    title: 'CCC x Nativz | Social Media Recurring',
    meeting_date: '2025-12-16',
    content: `## Social Performance
- Crystal Creek growing faster than major competitors (Butcher Box, Omaha Steaks, Factor)
- 1.6M video views last 28 days; peak 400k views on Dec 14
- Facebook is dominant platform; cost per page like = $0.07
- Primary audience age range: 35–65 (skews older, higher purchase intent)

## Creative & Content Needs
- Product photos and edits required for site and ads delivery
- Whole-cow / large-box unboxing content recommended for high engagement
- Capture Dunstan's holiday decorations footage for social posts

## Advertising Launch Plan
- Do not relaunch paid advertising until website photos are live
- Target ad campaign launch January 1
- Continue low-budget boosting for high-performing Facebook posts (~$200)`,
  },
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:kojf53mp58797pkpdafu1j05dh_20260113T170000Z',
    client_key: 'crystal_creek',
    title: 'CCC x Nativz | Social Media Recurring',
    meeting_date: '2026-01-13',
    content: `## RRD Production Quote And Fixes
- Full order: ~24,000 casebound hardcover books in ~2.5 months
- Partials possible: ~12,000 available starting ~45 days
- Finishing/warping cause identified as drying/handling during finishing
- Email proof expected within one week; printed wire-bound proof in 2–3 weeks

## Order Approval And Financials
- Tom must fund the order before production begins
- Stealth Health performance: $92k ebook sales this week; ~200k revenue last 30 days
- Estimated Stealth Health monthly expenses ≈ $135k

## Backlink Outreach
- Automated backlink outreach secured ~10 articles in the last 48 hours`,
  },
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:kojf53mp58797pkpdafu1j05dh_20260127T170000Z',
    client_key: 'crystal_creek',
    title: 'CCC x Nativz | Social Media Recurring',
    meeting_date: '2026-01-27',
    content: `## Crystal Creek Status
- 5.5M total views, ~12,300 new follows, ~1M monthly views
- Facebook is performing best; Instagram underperforming relative to other channels
- Website and ad readiness blocked by unfinished assets and Nick's delivery
- Need a dedicated project manager to chase Nick every three days

## Agency AI Productization
- Productize AI-driven creative package ($1,900/month for 25 videos)
- Build autonomous ad-testing system with landing pages and split tests
- Run models in-house using ClaudeBot/Cloudbot, Mac Minis, or VPS

## Nativz Nerd Concept
- Build on-demand reporting AI for client insights and retention
- Feature natural-language queries, custom date ranges, highlight positive metrics`,
  },

  // ── Hartley Law (2 meetings) ──
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:2eo9vrne6eakrn9p3h4bj3ct3l_20260105T183000Z',
    client_key: 'hartley',
    title: 'Hartley Law x Nativz / Bi-Weekly MKTG Meeting',
    meeting_date: '2026-01-05',
    content: `## Attendance & Relationship
- Hartley Law frequently misses bi-weekly marketing meetings
- They confirmed the January 5 meeting should work
- Continue to pay invoices; engagement remains active
- Team preference: remain hands-off to avoid appearing pushy

## Marketing Performance
- Content has generated ~250,000 views since engagement began
- Austin has been cooperative and performed well during shoots`,
  },
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:2eo9vrne6eakrn9p3h4bj3ct3l_20260119T183000Z',
    client_key: 'hartley',
    title: 'Hartley Law x Nativz / Bi-Weekly MKTG Meeting',
    meeting_date: '2026-01-19',
    content: `## Shaw's Halal Onboarding
- Client intends to start with four locations; expansion expected after strong results
- Social content opportunity: focus on sauce/drizzle and short-form video formats
- Middle Eastern restaurants historically perform well on social

## Goodyear Reporting
- Goodyear meeting scheduled at 1:30; client has strong results since October
- Prepare a Loom walkthrough showing key results and optimisations`,
  },

  // ── Weston Funding (1 meeting) ──
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:21ik5fkfo79dcr2p0734pjh6cg',
    client_key: 'weston',
    title: 'Proposal Review / Weston Funding x Nativz',
    meeting_date: '2026-01-29',
    content: `## Team Roles
- Trevor Anderson — CMO, oversees paid media and growth marketing strategy
- Cole Feigl — Co-founder and client lead
- Jake Pak — Social strategy lead; on-site videographer (Dallas)
- Jack Nelson — Editing and post-production lead

## Branding Options
- DIY with AI tools + designer (~$1,200), mid-tier brand guidelines (~$3,000), or full workshop (~$8,000+)
- Recommendation: start scrappy with AI + mid-tier design

## Content & Advertising Strategy
- Primary focus: fix-and-flip / construction borrowers (sniper targeting)
- Combine organic social growth with targeted Meta ad campaigns (TOFU/MOFU/BOFU)
- Typical cost per quality lead expected: $100–$200
- Meta special ads category applies

## Production
- One monthly shoot yields a full month of content (4–5 hours first shoot)
- Agency minimum ad spend $2,500; month-to-month agreement (30-day cancel)`,
  },

  // ── Safe Stop (1 meeting) ──
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:it1d3echdli01h5hmds0risj4c',
    client_key: 'safe_stop',
    title: 'Safe Stop x Nativz / Marketing Discussion',
    meeting_date: '2026-01-22',
    content: `## WayLeader Tracking & Conversions
- Ads direct users to business listing but don't track reservations
- WayLeader needs Google ad conversion ID and GA4 measurement ID
- Google Ads account experiencing billing/auth issues

## Content Deliverables
- Drone and photo assets collected; 15s, 30s, 60s ad cuts plus three GIFs
- Assets for social, YouTube, trucker directories, and investor email blast

## Citations & Maps
- Citation build produced 42 initial pickups; aggregator networks submitting to ~500 sites
- Google Maps directions now point to front entrance
- Apple Maps listing and GPS updates flagged as high priority

## Pricing & Promotions
- Current rate: $2.95/hour; 12-hour reservation window
- Free introductory offer extended; proposing half-price intro Jan 24–Feb 10/15
- Membership/recurring billing and association discounts (WIT/OOIDA) discussed`,
  },

  // ── Landshark (3 meetings) ──
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:0e430hov51m7in0slshmsbq3co',
    client_key: 'landshark',
    title: 'AC x Landshark',
    meeting_date: '2026-01-08',
    content: `## Website Launch Status
- Development complete; first review round ready for stakeholder review
- Connection to Destiny required for product shipping and final URL
- DNS records shared and ready; target launch end of this week or early next

## Content Samples & Filming
- Samples to include variety of pack sizes and packaging
- 4-packs won't be packaged until next week
- Capture variety packs, boxes, and fridge-style lifestyle shots

## Ad Copy And Legal
- Legal do's and don'ts exist; Devin to obtain and share guidance
- All ad creative and copy will be routed for approval before paid spend

## Pre-Launch Social Creative
- Prepare static/motion "coming soon" assets to populate social feeds ASAP
- Full paid media launch targeted top of February`,
  },
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:5t0l8o9qtkspof4m340o8gfc2q_20260122T203000Z',
    client_key: 'landshark',
    title: 'Landshark x Anderson Collaborative',
    meeting_date: '2026-01-22',
    content: `## Team Roles
- Cole and Trevor: strategy and execution; Jake and Jack: organic social and content
- Romina: website, graphics, QA, launch integration; Nativz and Gregorio: paid media

## Website & Destiny Integration
- Website development finalized; awaiting product load and Destiny integration
- Privacy policy and legal pages required before DNS update
- Single-serve section set to "Coming Soon" until Q2

## Creative Feedback
- Prefer truck-wrap designs 1B or 1C; reduce can size for 1C
- Replace "Paradise in every sip" tagline with prominent Landshark logo
- Reduce glare on cans; watery background preferred

## Social & Creator Strategy
- Content pillars: man-on-street, skits, challenges, aspirational relaxed lifestyle
- Decentralized creator approach: micro/mid influencers, 50/50 male-female split

## SEO
- Six blog posts proposed to support SEO and AI visibility
- Citation build recommended; Margaritaville HQ as potential physical listing`,
  },
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:5t0l8o9qtkspof4m340o8gfc2q_20260205T203000Z',
    client_key: 'landshark',
    title: 'Landshark x Anderson Collaborative',
    meeting_date: '2026-02-05',
    content: `## Creative Plan & Creator Coordination
- Anderson received product and will distribute to initial creators for content
- Creative briefs will be sent before each shoot for Devin to review
- Placeholder stills available to post this week

## Photography Direction
- Lifestyle photography targeting 25–44, relaxed-casual, happy/high-energy vibe
- Gender split approximately 50/50 male/female; beach and lake settings

## Sampling & Brand Activations
- Branded Landshark costume concept for events, sampling, and skit content

## Website & Launch Readiness
- Homepage adjustments completed; "Where To Buy" connected to product locator
- Privacy policy links updated; Business manager access complete
- Next steps: tracking and ad account setup`,
  },

  // ── Toastique (6 meetings) ──
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:6vancsd33p2ke0f732pk15fnds_20260108T160000Z',
    client_key: 'toastique',
    title: 'AC x Toastique | Weekly Marketing Meeting',
    meeting_date: '2026-01-08',
    content: `## Campaign Strategy
- Prioritise get-direction requests, profile visits, and location visits over online orders
- Coffee keywords drive low-cost, high-volume store visits
- First-order online discount promos produced poor return in December
- CPMs and engagement rose in early January

## Reputation Management
- Review acquisition ranked top-three brand priority for 2026
- Dual-incentive model: employee rewards plus brand-level incentives (~$1–$2.50 per review)

## Creative & Content
- Target five 30-second test videos ready by end of January
- Tampa assets to be integrated; website video updates targeted by Feb 1
- CTV test for DC markets planned mid/late February

## Franchise Development
- Brand Central go-live targeted March 1
- Franchise-development campaign: $20K/month Jan–Mar testing budget for UGC recruitment videos`,
  },
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:6vancsd33p2ke0f732pk15fnds_20260115T160000Z',
    client_key: 'toastique',
    title: 'AC x Toastique | Weekly Marketing Meeting',
    meeting_date: '2026-01-15',
    content: `## Grand Openings & Transfers
- Three grand openings confirmed: Great Falls, San Jose, LA South Park
- East Cobb scheduled as transfer, tentative reopening January 31

## Bryant Park Strategy
- Run 14-day paid test emphasizing coffee/breakfast to acquire customers
- Google CPC: breakfast/coffee ≈ $0.76, lunch ≈ $2.40
- Test captive Wi-Fi to verify store visits and capture guest data

## Support For Underperforming Franchisees
- Brand development SEO fund launching; stores < $40k monthly get PPC instead of SEO
- Near-term recovery: reviews program, local promos, community engagement, LTV offers

## Content & AI
- Guatemala footage delivered; AI avatar/voiceover demonstrations successful
- Stack: Sora2/Gemini/11Labs workflow for avatar and voice replication`,
  },
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:6vancsd33p2ke0f732pk15fnds_20260122T160000Z',
    client_key: 'toastique',
    title: 'AC x Toastique | Weekly Marketing Meeting',
    meeting_date: '2026-01-22',
    content: `## Great Falls Opening
- Stop paid ad spend immediately; keep store open for Saturday promotion
- Move full grand opening to Valentine's Week
- Use Saturday turnout to determine Valentine's Day promotional aggressiveness

## Content & Creative Strategy
- Produce more product-focused, less seasonal creatives
- Bi-weekly content meeting scheduled Tuesdays at 1:00pm ET
- Build content calendar tying creatives to store best-sellers

## Reporting & Dashboards
- Build simplified franchisee dashboard as single source of truth
- Snowflake holds cross-store sales and item-level data
- Roll out location and category page SEO updates via BDF initiative

## Brand Development Fund
- Kyle to open BDF in February; spend begins March
- Distress-location two-week Google Ads tests approved`,
  },
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:4ht1sfqq512qi9oloe04a2lfg1_20260127T180000Z',
    client_key: 'toastique',
    title: 'Toastique x AC | Content Discussion',
    meeting_date: '2026-01-27',
    content: `## Content Strategy
- Focus on UGC and decentralized creator-driven social content for 2026
- Prioritize face-driven local posts plus seasonal and product content pillars
- Run both brand-recall and product-lift campaigns with distinct creative sets

## Creator Procurement
- Centralize creator management using Upfluence insights
- Build a Toastique-native creator portal for procurement, contracts, tracking
- Activate creators to post organically while using their assets as ad units

## Production & Scale
- Target 900 ad units by end of year as testing-library KPI
- Offshore editors will scale daily edit volume
- Implement frequent approval workflow and dedicated creative reviewer

## Reporting
- Simplify franchisee reporting into single-page store dashboards
- Pull Meta Business Suite data into visual dashboards; add AI metric explanations`,
  },
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:6vancsd33p2ke0f732pk15fnds_20260129T160000Z',
    client_key: 'toastique',
    title: 'AC x Toastique | Weekly Marketing Meeting',
    meeting_date: '2026-01-29',
    content: `## Grand Opening Status
- San Jose nearing with ~1,000 RSVPs; influencer VIP day activity strong
- Check-in: use Eventbrite app + QR scanning
- Consider coupon/QR code sync to correlate RSVPs with POS/loyalty

## Tracking & Reporting
- Franchisees require simplified metrics: spend vs revenue (ROAS) and confirmed store visits
- Data pipeline improvements: captive Wi-Fi, POS (Cake) sync, customer data feeds
- Two press releases per grand opening: "coming soon" (45–60 days out) and "locked-in" (30 days out)

## Paid Media
- Minimum baseline: $750 Google ads per location; social at $1,500 tier
- New York test: prove incremental performance from extra $1,500 Google spend
- Google campaigns often exhaust budgets by midday; test reallocating to lunchtime

## Content & Creators
- Hire to cover community management, UGC/EGC ingestion, editing, rapid posting
- Goals: TikTok 50K, Facebook 15K, LinkedIn 7.5K, YouTube 5K
- Plan to onboard ~500 paid influencers`,
  },
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:6vancsd33p2ke0f732pk15fnds_20260205T160000Z',
    client_key: 'toastique',
    title: 'AC x Toastique | Weekly Marketing Meeting',
    meeting_date: '2026-02-05',
    content: `## Grand Opening & Events
- LA South Park expected ~825 RSVPs, target attendance near 1,000
- VIP influencer night scheduled; East Cobb reopening call being scheduled

## Local SEO & Listings
- LA South Park categorized as "acai bar" — doesn't appear for "coffee" searches
- Danville has 58 reviews; local SEO and maps need improvement
- Audit and standardize primary/secondary categories across Google/Apple/Yelp

## Brand Development Fund
- BDF collection started; first payment posts next week
- Kyle requires weekly KPIs and dashboard visibility before paid ad spend
- Use early BDF for baseline local SEO work; 550 USD per store SEO tier

## Content & Social
- Content capture with Celia scheduled Feb 10 for spring special video assets
- Social growth: Facebook +750 followers last month; TikTok focus next
- CTV test planned for March; minimum $1,000 per location recommended`,
  },

  // ── Equidad Homes (3 meetings) ──
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:nm0hn2qdnifhr8jga26g4e6fic',
    client_key: 'equidad',
    title: 'Equidad Homes x AC',
    meeting_date: '2026-01-20',
    content: `## Quarter Objectives
- Validate product-market fit with 4–5 closed deals in Q1
- Scale to 5–10 deals per month after validation
- Improve SOPs and sales process before increasing ad spend

## Onboarding & Launch
- Social onboarding document sent; LinkedIn not included
- Target launch date: February 2; editing and content review required

## Budget
- Q1 ad budget set to $5,000–$7,000 initial spend
- Marketing spend on client's dedicated marketing card

## Content & AI
- Shoot delivered usable footage; AI can fill content gaps
- Produce AI-driven avatar of Jackson for ongoing short-form content
- Create bilingual deepfake persona for Hispanic audience targeting`,
  },
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:0c6ppjuroa9mg09eb64u2biu50',
    client_key: 'equidad',
    title: 'AC x Equidad Homes',
    meeting_date: '2026-02-01',
    content: `## Compliance
- Must state EquiD Homes is an investment platform providing educational guidance
- Cannot claim or imply consumer pre-qualification without NMLS licensing
- Add NMLS number on videos once licensing complete (expected end of month)

## Campaign Strategy
- Month 1: run tests (CPM, CTR, conversion leak points); Month 2: scale; Month 3: optimize
- Initial paid budget: $5,000 for first month; Q1 goal: 2–4 closed deals

## Lead Flow & CRM
- Simple intro form on homepage: name, phone, email, zip
- Speed-to-lead: text within two minutes; phone follow-up within one hour
- Pipeline: New Lead → Discovery → Application → Underwriting → Home Search → Pre-approval → Contract → Closing

## Channels
- Primary paid: TikTok, Meta (Facebook/Instagram), and Google
- Prioritise short-form reels for paid acquisition; direct-response first`,
  },
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:4f22asbujiktp778eepkatvn5q_20260205T150000Z',
    client_key: 'equidad',
    title: 'Equidad Homes x AC | Bi-Weekly Marketing Huddle',
    meeting_date: '2026-02-05',
    content: `## Compliance & Licensing
- Third-party underwriter licensed in FL/GA; Texas approvals take ~1 month
- Florida mortgage company licensing estimated ~5 months
- Use "pre-qualified" only if third-party originator applies
- Facebook housing Special Ads Category requires extra compliance steps

## Launch Plan & Tracking
- Funnel outline describes ad flow, audience stages, conversion steps
- Tags and ad accounts connected; testing GoHighLevel plugin for improved data
- CRM lead source mapping required to attribute leads

## Content Strategy
- Initial set: 3–4 posts (educational, founder talking head, property footage)
- Month 2: repurpose shoot materials and scale using AI iterations/A/B tests`,
  },

  // ── Kumon (2 meetings) ──
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:27350chcqacb74dkdon86abfnm',
    client_key: 'kumon',
    title: '2026 Planning - AC x Kumon',
    meeting_date: '2025-12-18',
    content: `## Contract & Scope
- Month-to-month engagement with 30-day opt-out
- Deliverables: 2 video shoots per month, 12 videos per month, three static carousels

## Content Strategy
- Carousels: awareness-focused and educational (math process, worksheet showcases, reading)
- A series of instructor topics required before each shoot

## Shooting Logistics
- Avoid international travel with heavy camera gear where possible
- Preferred: have instructors travel to Dallas or use local DFW locations
- Identify camera-ready instructors in Toronto and western Canada

## Creative Iteration
- Prioritize and refine previously high-performing video formats
- Create new content variants based on clear winners for A/B testing`,
  },
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:bccqd31i0sc4tjqv7ggv26o62c',
    client_key: 'kumon',
    title: 'AC x Kumon',
    meeting_date: '2026-02-03',
    content: `## Trip Scheduling
- Canada and Austin shoots targeted for mid-February to early March
- Plan to run ACE (Dallas) and Austin instructor back-to-back to combine trips
- Jacob needs confirmed dates and purchased tickets for expedited passport

## Content Strategy & Trend Tools
- AC demonstrated enterprise trend-listening plus in-house tools
- Tools report topic volume, sentiment, resonance, and estimated audience reach
- WhiteSpark 2026: social signals increasingly affect local and AI search ranking

## Video Shoot Plan
- Recommended mix: 40% instructor education, 20% instructor+student, 20% parent testimonials, 20% experimental
- Instructors should be neutral/confident on camera; high acting skill not required
- Prioritize 1–2 high-quality parent testimonials per center

## Analytics
- Kumon reported ~90% drop in Canada organic social traffic (origin: Meta)
- Multiple spam/AI-generated negative reviews on listings`,
  },

  // ── Rana Furniture (1 meeting) ──
  {
    fyxer_id: '7e53242f-a4f0-414f-a34d-655255426131:scfrq738mij2up8j3agmqfbpdg',
    client_key: 'rana',
    title: 'AC x Rana Furniture Kick-Off Meeting',
    meeting_date: '2026-01-22',
    content: `## Shopify Migration
- Rana will migrate to Shopify; Blueport extended support for one year
- Migration estimated six weeks to two months; CSV/data readiness may extend timeline
- Product bundles/kits require custom inventory and availability logic

## Creative Strategy
- Meta Andromeda update makes creative the primary ad performance lever
- Short-form creative strategy with Jake and Jack leading
- Channels: Meta, Google Search, Performance Max, programmatic CTV
- Short-form editing pricing: $150 per video (<60s); voiceover included

## Audience & Brand Positioning
- Primary customer base: Hispanic South Florida; maintain that brand identity
- Test Spanish versus English creatives; native Spanish team available

## Budget & Promotions
- Proposed monthly budget example: $135,000
- Favor reward programs and bundle promotions to drive repeat purchases`,
  },
];

// ---------------------------------------------------------------------------
// Supabase REST helpers
// ---------------------------------------------------------------------------
async function supabaseInsert(table: string, row: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Insert into ${table} failed (${res.status}): ${err}`);
  }
  return res.json();
}

async function supabaseSelect(table: string, params: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Select from ${table} failed (${res.status}): ${err}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Embedding helper (copied from embeddings.ts for standalone use)
// ---------------------------------------------------------------------------
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_API = 'https://generativelanguage.googleapis.com/v1beta/models';

async function generateEmbedding(text: string): Promise<number[]> {
  const truncated = text.slice(0, 8000);
  const res = await fetch(
    `${EMBED_API}/${EMBED_MODEL}:embedContent?key=${GOOGLE_AI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: truncated }] },
        outputDimensionality: 768,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding failed: ${err}`);
  }
  const data = await res.json();
  return data.embedding.values;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n📥 Importing ${MEETINGS.length} historical meetings...\n`);

  // Check for existing entries to avoid duplicates
  const existing = await supabaseSelect(
    'client_knowledge_entries',
    'select=metadata&type=eq.meeting_note'
  );
  const existingIds = new Set(
    (existing as { metadata: { fyxer_meeting_id?: string } }[])
      .map((e) => e.metadata?.fyxer_meeting_id)
      .filter(Boolean)
  );
  console.log(`Found ${existingIds.size} existing meeting entries.\n`);

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const meeting of MEETINGS) {
    const fyxerId = meeting.fyxer_id;
    if (existingIds.has(fyxerId)) {
      console.log(`⏭  SKIP (exists): ${meeting.title} [${meeting.meeting_date}]`);
      skipped++;
      continue;
    }

    const clientId = CLIENTS[meeting.client_key];
    if (!clientId) {
      console.log(`⏭  SKIP (no client): ${meeting.title}`);
      skipped++;
      continue;
    }

    const entryTitle = `Meeting notes ${meeting.meeting_date} — ${meeting.title}`;

    try {
      // Insert entry
      const [entry] = await supabaseInsert('client_knowledge_entries', {
        client_id: clientId,
        type: 'meeting_note',
        title: entryTitle,
        content: meeting.content,
        metadata: {
          meeting_date: meeting.meeting_date,
          source: 'fyxer',
          fyxer_meeting_id: fyxerId,
        },
        source: 'imported',
      });

      // Generate and store embedding
      try {
        const embedding = await generateEmbedding(`${entryTitle}\n\n${meeting.content}`);
        const vecStr = `[${embedding.join(',')}]`;
        await fetch(
          `${SUPABASE_URL}/rest/v1/client_knowledge_entries?id=eq.${entry.id}`,
          {
            method: 'PATCH',
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ embedding: vecStr }),
          }
        );
      } catch (embErr) {
        console.warn(`  ⚠ Embedding failed for ${entry.id}: ${embErr}`);
      }

      console.log(`✅ ${entryTitle}`);
      imported++;

      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error(`❌ FAIL: ${entryTitle} — ${err}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${imported} imported, ${skipped} skipped, ${failed} failed`);
  console.log('Done!\n');
}

main().catch(console.error);
