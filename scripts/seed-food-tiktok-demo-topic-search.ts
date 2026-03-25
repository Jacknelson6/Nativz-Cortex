/**
 * One-off: fill the most recent topic search matching "food" + tik/tok with rich demo results.
 * Usage: npx tsx scripts/seed-food-tiktok-demo-topic-search.ts
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { loadEnvLocal } from './load-env-local';
import { createAdminClient } from '@/lib/supabase/admin';

loadEnvLocal();

const DEMO_SUMMARY = `Food TikTok in early 2026 is dominated by hyper-visual "eat with me" formats, regional comfort-food nostalgia, and algorithm-friendly hooks in the first 1.2 seconds. A standout cluster is premium café and bowl brands (think Toastique-style chains): content that sells acai bowls, loaded toast, and smoothies almost entirely through **beautiful product visuals**—overhead "table shots," slow drizzle then **fast cuts** on the beat, macro close-ups of granola clusters and berry gloss, and cross-section reveals where layers read as color blocks. That pacing (tight 0.3–0.8s cuts on hooks, slightly longer holds on the "money" bite) keeps completion high without feeling like a slow tutorial. Creators and brand accounts alike lean into ASMR plating and "what I eat in a day" authenticity; comment sections show high curiosity ("recipe pls", "where is this") and light debate on authenticity vs performance. Brands winning here pair hands-only prep with **hero shots that look editorial**—not messy kitchen realism—plus text-on-screen for menu names and duet-friendly sound choices. Short-form food content is increasingly cross-posted from TikTok to Reels and Shorts with minor reframes; TikTok still leads for discovery and comment-driven virality.`;

function src(
  url: string,
  title: string,
  type: 'web' | 'discussion' | 'video',
  relevance: string,
  platform?: 'tiktok' | 'youtube' | 'reddit' | 'web'
) {
  return { url, title, type, relevance, platform };
}

const trendingTopics = [
  {
    name: 'Toastique-style cafés: acai bowls, toast stacks & "menu as cinema"',
    resonance: 'viral' as const,
    sentiment: 0.58,
    posts_overview:
      'Chains and indies in the gourmet toast / acai bowl space win when every frame looks like a mini ad: saturated fruit against neutral bowls, syrup and nut butter catching light, and toppings arranged so the cross-section "reads" in one glance. Videos that stack **fast cuts** (ingredient toss, blend pour, finish garnish) on trending audio outperform static countertop pans; the product never disappears from frame for long—scrollers stay oriented. "First bite" hooks with crunch + pull-away spoon are reused across locations because they telegraph freshness without a voiceover.',
    comments_overview:
      'High save rate on posts that name the bowl or toast build in on-screen text; "which location?" and "is that on the menu?" drive replies. Audiences respond when lighting is consistent (bright, slightly warm) and surfaces look clean—perceived quality transfers to the brand.',
    sources: [
      src('https://www.tiktok.com/tag/acaibowl', 'TikTok #acaibowl', 'video', 'Bowl aesthetic and topping trends', 'tiktok'),
      src('https://www.tiktok.com/tag/gourmettoast', 'TikTok #gourmettoast', 'video', 'Loaded toast and brunch visual language', 'tiktok'),
      src('https://example.com/cafe-short-form-2026', 'Café short-form creative benchmarks', 'web', 'Edit pacing and hook length for QSR / café', 'web'),
    ],
    video_ideas: [
      {
        title: '8-cut "build this bowl" — beat-synced, no talking',
        hook: 'Every cut lands on the beat; the last frame is the full bowl overhead.',
        format: 'fast_cut_montage',
        virality: 'high' as const,
        why_it_works:
          'Fast cuts sustain attention while macros sell texture (granola, seeds, berry sheen). No VO keeps sound flexible for trends.',
        script_outline: [
          '0–0.8s: frozen fruit + liquid pour macro',
          '0.8–1.6s: blend cap twist + pour into bowl',
          '1.6–2.4s: three topping drops on rhythm',
          '2.4–3.2s: drizzle close-up',
          '3.2–4s: overhead hero + menu name text',
        ],
        cta: 'Save for your next café run',
      },
      {
        title: 'Cross-section toast pull — "layers you can read"',
        hook: 'One diagonal slice, pull apart slow then snap to wide.',
        format: 'product_reveal',
        virality: 'viral_potential' as const,
        why_it_works:
          'Beautiful product visuals carry the story; the pull reveals fillings and makes the item feel substantial. Works for sweet and savory stacks.',
        script_outline: ['Establish full plate beauty shot', 'Knife + slice ASMR', 'Hands pull with cheese or spread stretch', 'Fast cut to menu callout'],
        cta: 'Tag someone who needs this toast',
      },
      {
        title: 'Location POV: "what we put on the pass today"',
        hook: 'Same lighting, three bowls, 12 seconds — speed is the flex.',
        format: 'behind_the_pass',
        virality: 'high' as const,
        why_it_works:
          'Reassures consistency across service; fast cuts between finished plates imply volume and freshness without saying "busy."',
      },
    ],
  },
  {
    name: 'Butter boards & communal grazing 2.0',
    resonance: 'high' as const,
    sentiment: 0.42,
    posts_overview:
      'Butter boards evolved into "dip highways" and themed grazing tables; TikTok views cluster around weekend hosting and holiday prep.',
    comments_overview:
      'Audiences ask for dairy-free swaps and worry about double-dipping; high save rate on posts that show grocery lists in captions.',
    sources: [
      src('https://www.tiktok.com/tag/butterboard', 'TikTok #butterboard', 'video', 'Hashtag velocity and save/share pattern', 'tiktok'),
      src('https://example.com/food-hosting-trends', 'Hosting trends Q1 2026', 'web', 'Editorial roundup of grazing formats', 'web'),
    ],
    video_ideas: [
      {
        title: '60-second "build a butter highway" POV',
        hook: 'You only need three ingredients and one board nobody expects.',
        format: 'hands_only_tutorial',
        virality: 'high' as const,
        why_it_works: 'Satisfying spread motion + text recipe in first frame = high completion; easy to stitch with wine-night context.',
        script_outline: ['Hook with finished board', 'Ingredient flat lay', 'Speed-build with ASMR', 'Caption grocery list', 'CTA: duet your version'],
        cta: 'Save for your next hosting night',
      },
      {
        title: 'Duet: "budget vs bougie butter board"',
        hook: 'Same layout — $12 vs $60. You decide which one gets eaten first.',
        format: 'split_comparison',
        virality: 'viral_potential' as const,
        why_it_works: 'Comparison formats drive comments; food TikTok loves price transparency.',
      },
    ],
  },
  {
    name: 'Regional comfort: hot pot, birria, and soup season',
    resonance: 'viral' as const,
    sentiment: 0.55,
    posts_overview:
      'Winter clips of sizzling broth, cheese pulls, and "first dip" moments outperform static recipe cards by roughly 3× in median engagement.',
    comments_overview:
      'Strong diaspora nostalgia threads; users tag hometown spots and debate "authentic" vs "Americanized" in good faith.',
    sources: [
      src('https://www.youtube.com/results?search_query=hot+pot+asmr', 'YouTube hot pot ASMR compilations', 'video', 'Long-form sound trends lifted to TikTok', 'youtube'),
      src('https://reddit.com/r/FoodTok', 'r/FoodTok weekly thread', 'discussion', 'Cross-links to viral TikToks', 'reddit'),
    ],
    video_ideas: [
      {
        title: '"First bubble" hot pot countdown',
        hook: 'Wait for the bubble — then everything changes.',
        format: 'reaction_pov',
        virality: 'high' as const,
        why_it_works: 'Anticipation + steam visuals trigger replays; sound of boil is ASMR-adjacent.',
        script_outline: ['Silent hook — lid lift', 'Timer on screen', 'Ingredient drop macro', 'Reaction bite', 'Shop link in bio joke'],
      },
    ],
  },
  {
    name: 'Healthy-ish desserts that still look illegal',
    resonance: 'high' as const,
    sentiment: 0.38,
    posts_overview:
      'Protein fluff, date snickers, and yogurt bark dominate #healthtok crossover; "macros on screen" is now baseline.',
    comments_overview:
      'Skepticism when sweeteners are hidden; transparency in ingredients wins trust and shares.',
    sources: [src('https://www.tiktok.com/tag/proteindessert', 'TikTok #proteindessert', 'video', 'Sustained weekly post volume', 'tiktok')],
    video_ideas: [
      {
        title: 'Protein "Snickers" — macro overlay the whole time',
        hook: 'If it fits your macros, it fits your mouth.',
        format: 'tutorial_macros',
        virality: 'medium' as const,
        why_it_works: 'On-screen numbers reduce comment spam asking for calories.',
      },
    ],
  },
  {
    name: 'Street food POV + "price reveal" captions',
    resonance: 'high' as const,
    sentiment: 0.48,
    posts_overview:
      'Night-market walks and cart POVs spike on Friday evenings; price-in-caption reduces "how much?" fatigue.',
    comments_overview:
      'Location requests and hygiene jokes; creators who add map pins see higher profile clicks.',
    sources: [src('https://example.com/street-food-tiktok-2026', 'Street food TikTok report', 'web', 'Aggregate view benchmarks', 'web')],
    video_ideas: [
      {
        title: 'One block, five bites, five prices',
        hook: 'You pick the winner — I only pick the next cart.',
        format: 'walking_pov',
        virality: 'high' as const,
        why_it_works: 'Chapter-style pacing matches TikTok watch-time curves.',
      },
    ],
  },
  {
    name: 'AI voiceover recipe roasts (comedy x food)',
    resonance: 'medium' as const,
    sentiment: 0.22,
    posts_overview:
      'Sarcastic AI narrators over failed bakes or chaotic kitchens — humor carries lower sentiment but very high share.',
    comments_overview:
      'Meta jokes about "ChatGPT wrote this script"; risk of fatigue if audio sounds identical across creators.',
    sources: [src('https://www.tiktok.com/tag/airecipe', 'TikTok #airecipe', 'video', 'Emerging cluster', 'tiktok')],
    video_ideas: [
      {
        title: 'AI roasts my "healthy" lunch',
        hook: 'It said this was a salad. It was mostly cheese.',
        format: 'comedy_voiceover',
        virality: 'medium' as const,
        why_it_works: 'Relatable failure + punchy VO = share to friends.',
      },
    ],
  },
  {
    name: 'Kids lunchbox aesthetics & bento hacks',
    resonance: 'medium' as const,
    sentiment: 0.61,
    posts_overview:
      'Parent creators post compartment layouts and "eat the rainbow" themes; strong saves before school semesters.',
    comments_overview:
      'Debates on time investment vs practicality; mini cutters and silicone molds get tagged constantly.',
    sources: [src('https://www.tiktok.com/tag/lunchboxideas', 'TikTok #lunchboxideas', 'video', 'Seasonal save spikes', 'tiktok')],
    video_ideas: [
      {
        title: 'Tuesday lunchbox in 8 minutes (real time)',
        hook: 'No cute music — just speed and a timer you can steal.',
        format: 'real_time_prep',
        virality: 'medium' as const,
        why_it_works: 'Parents trust real-time over jump cuts for planning.',
      },
    ],
  },
];

const metrics = {
  web_results_found: 42,
  discussions_found: 28,
  videos_found: 156,
  total_sources: 226,
  total_video_views: 128000000,
  total_discussion_replies: 89000,
  overall_sentiment: 0.44,
  conversation_intensity: 'very_high' as const,
  topic_score: 86,
  content_opportunities: trendingTopics.reduce((n, t) => n + t.video_ideas.length, 0),
  trending_topics_count: trendingTopics.length,
  sources_analyzed: 226,
};

const emotions = [
  { emotion: 'Curiosity', percentage: 28, color: '#5ba3e6' },
  { emotion: 'Craving / hunger', percentage: 24, color: '#e6a55b' },
  { emotion: 'Nostalgia', percentage: 18, color: '#a78bfa' },
  { emotion: 'Humor', percentage: 16, color: '#34d399' },
  { emotion: 'Skepticism', percentage: 14, color: '#94a3b8' },
];

const content_breakdown = {
  intentions: [
    { name: 'Learn a recipe or technique', percentage: 34, engagement_rate: 0.12 },
    { name: 'Entertainment / scroll', percentage: 29, engagement_rate: 0.09 },
    { name: 'Discover restaurants or products', percentage: 22, engagement_rate: 0.11 },
    { name: 'Community / identity', percentage: 15, engagement_rate: 0.08 },
  ],
  categories: [
    { name: 'Home cooking & meal prep', percentage: 31, engagement_rate: 0.11 },
    { name: 'Restaurant / street food', percentage: 27, engagement_rate: 0.13 },
    { name: 'Health & macros', percentage: 18, engagement_rate: 0.1 },
    { name: 'Baking & desserts', percentage: 14, engagement_rate: 0.09 },
    { name: 'Beverages & coffee', percentage: 10, engagement_rate: 0.07 },
  ],
  formats: [
    { name: 'Fast-cut product beauty (café / bowl / toast)', percentage: 24, engagement_rate: 0.15 },
    { name: 'POV / hands only', percentage: 22, engagement_rate: 0.14 },
    { name: 'Voiceover tutorial', percentage: 20, engagement_rate: 0.1 },
    { name: 'GRWM / day-in-food', percentage: 16, engagement_rate: 0.09 },
    { name: 'Stitch / duet / reaction', percentage: 10, engagement_rate: 0.12 },
    { name: 'Static recipe text on video', percentage: 8, engagement_rate: 0.08 },
  ],
};

const raw_ai_response = {
  summary: DEMO_SUMMARY,
  overall_sentiment: 0.44,
  conversation_intensity: 'very_high' as const,
  emotions,
  content_breakdown,
  trending_topics: trendingTopics,
  big_movers: [
    {
      name: 'Premium bowl & toast café content (Toastique-style pattern)',
      type: 'creator' as const,
      url: null,
      why: 'Accounts that treat every post as a product hero—tight edits, gorgeous light, obvious menu clarity—own the "I want that today" reaction in comments.',
      tactics: [
        'Hero frame in first 0.5s (finished bowl or toast)',
        'Fast cuts synced to audio; hold 1–2s on drizzle / cross-section',
        'On-screen text: bowl name + one ingredient hook',
        'Overhead + 45° macro pairing every series',
      ],
      takeaway: 'Invest in repeatable lighting and pass-through plating; edit rhythm matters as much as recipe.',
    },
    {
      name: 'Regional night-market creators (collective)',
      type: 'creator' as const,
      url: null,
      why: 'Consistent POV + price captions became a recognizable format cluster.',
      tactics: ['Price in first 2s', 'Map pin in bio', 'Series numbering'],
      takeaway: 'Batch film one location; release as a numbered series.',
    },
    {
      name: 'Macro-forward dessert niche',
      type: 'product' as const,
      url: null,
      why: 'On-screen nutrition reduces friction for health-curious scrollers.',
      tactics: ['Always show grams + kcal', 'Pin comment FAQ', 'Link staple ingredients'],
      takeaway: 'Treat nutrition overlay as part of the hook, not an afterthought.',
    },
  ],
  platform_breakdown: [
    {
      platform: 'tiktok',
      post_count: 1200,
      comment_count: 450000,
      avg_sentiment: 0.46,
      top_hashtags: ['foodtok', 'acaibowl', 'brunchtok', 'asmrfood', 'healthtok'],
    },
    { platform: 'youtube', post_count: 180, comment_count: 92000, avg_sentiment: 0.41, top_channels: ['Shorts food compilations'] },
    { platform: 'reddit', post_count: 340, comment_count: 28000, avg_sentiment: 0.35, top_subreddits: ['FoodTok', 'Cooking', 'HealthyFood'] },
    { platform: 'web', post_count: 80, comment_count: 0, avg_sentiment: 0.4 },
  ],
  conversation_themes: [
    {
      theme: 'Authenticity vs performance',
      post_count: 420,
      sentiment: 0.15,
      platforms: ['tiktok', 'reddit'],
      representative_quotes: ['Is this real or for the algorithm?', 'Still tastes good though'],
    },
    {
      theme: 'Recipe access & grocery cost',
      post_count: 510,
      sentiment: 0.08,
      platforms: ['tiktok', 'web'],
      representative_quotes: ['Drop the grocery list', 'That cheese costs how much?'],
    },
    {
      theme: '"Too pretty to eat" café visuals',
      post_count: 380,
      sentiment: 0.52,
      platforms: ['tiktok'],
      representative_quotes: [
        'The lighting in this bowl is insane',
        'This is the same cut style every good café uses',
        'Fast cuts but I still saw every topping',
      ],
    },
    {
      theme: 'Cultural ownership & fusion',
      post_count: 290,
      sentiment: 0.22,
      platforms: ['tiktok', 'youtube'],
      representative_quotes: ['My grandma made it first', 'Fusion done respectfully hits'],
    },
  ],
};

const serp_data = {
  webResults: [
    { title: 'Food TikTok trends to watch in 2026', url: 'https://example.com/food-tiktok-2026', description: 'Grazing tables, macro desserts, and street POV still lead discovery.' },
    { title: 'How short-form food video changed grocery search', url: 'https://example.com/grocery-search-tiktok', description: 'Search spikes follow viral sounds and ingredient close-ups.' },
    {
      title: 'Why acai and toast cafés win on TikTok: visuals first',
      url: 'https://example.com/cafe-tiktok-visuals',
      description: 'Brands like Toastique lean on beautiful product shots, fast cuts on the beat, and cross-section reveals for bowls and gourmet toast.',
    },
  ],
  discussions: [
    { title: 'What food TikTok trend aged the fastest?', url: 'https://reddit.com/r/FoodTok/comments/demo1', description: 'Users debate butter boards vs cloud bread.', forum: 'FoodTok', answers: 240, topComment: 'Anything with 47 cuts in the thumbnail.' },
  ],
  videos: [
    { title: 'Hot pot first bubble compilation', url: 'https://youtube.com/watch?v=demo', description: 'ASMR broth moments clipped to TikTok.', age: '1w', views: '12M', creator: 'FoodShortsDaily', duration: '0:45' },
    {
      title: 'Acai bowl fast-cut trend mix',
      url: 'https://youtube.com/watch?v=demo-acai',
      description: 'Overhead bowls, drizzle macros, and beat-synced edits from café-style accounts.',
      age: '3d',
      views: '4.2M',
      creator: 'BowlTokClips',
      duration: '0:34',
    },
  ],
};

async function main() {
  const admin = createAdminClient();
  let { data: rows, error: qErr } = await admin
    .from('topic_searches')
    .select('id, query')
    .ilike('query', '%food%tik%')
    .order('created_at', { ascending: false })
    .limit(5);

  if (qErr) {
    console.error(qErr);
    process.exit(1);
  }
  if (!rows?.length) {
    const second = await admin
      .from('topic_searches')
      .select('id, query')
      .ilike('query', '%tiktok%')
      .order('created_at', { ascending: false })
      .limit(5);
    rows = second.data ?? [];
    qErr = second.error;
  }
  if (qErr) {
    console.error(qErr);
    process.exit(1);
  }
  const row =
    rows?.find((r) => /food/i.test(r.query) && /tik/i.test(r.query)) ??
    rows?.find((r) => /food/i.test(r.query)) ??
    rows?.[0];
  if (!row) {
    console.error('No matching topic search found. Try a search whose query contains "food" and "tik".');
    process.exit(1);
  }

  const now = new Date().toISOString();
  const { error: uErr } = await admin
    .from('topic_searches')
    .update({
      status: 'completed',
      processing_started_at: null,
      summary: DEMO_SUMMARY,
      metrics,
      emotions,
      content_breakdown,
      trending_topics: trendingTopics,
      serp_data,
      raw_ai_response: raw_ai_response,
      tokens_used: 12500,
      estimated_cost: 0.42,
      completed_at: now,
      platform_data: {
        stats: raw_ai_response.platform_breakdown,
        sourceCount: 226,
        demo: true,
        seededAt: now,
      },
    })
    .eq('id', row.id);

  if (uErr) {
    console.error(uErr);
    process.exit(1);
  }
  console.log('Updated topic search:', row.id, row.query);
}

main();
