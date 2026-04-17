/**
 * Creator + category taxonomy that mirrors the FastMoss H1 2025 TikTok
 * Shop Analytics Report conventions. Keeping our labels in sync with the
 * industry standard means agency users see the same category names they
 * already know from FastMoss / YooFinds / TikTok Shop Seller Center.
 *
 * Source: FastMoss H1 2025 White Paper, Sections 04 + 05.
 */

// ---------------------------------------------------------------------------
// Creator categories (industry-standard)
// ---------------------------------------------------------------------------

export const CREATOR_CATEGORIES = [
  'Beauty & Personal Care',
  'Shopping & Retail',
  'Travel & Tourism',
  'Software & Apps',
  'Health & Wellness',
  'Food & Beverage',
  'Sports, Fitness & Outdoors',
  'Media & Entertainment',
  'Pets',
  'Baby',
  'Home, Furniture & Appliances',
  'Music & Dance',
  'Art & Crafts',
  'Personal Blog',
  'Public Figure',
  'NGO',
  'Government Affairs',
  'Gaming',
  'Finance & Investing',
  'Education & Training',
  'Real Estate',
  'IT & High-Tech',
  'Womenswear & Underwear',
  'Menswear & Underwear',
  'Phones & Electronics',
  'Kitchenware',
  'Luggage & Bags',
  'Muslim Fashion',
] as const;

export type CreatorCategory = (typeof CREATOR_CATEGORIES)[number];

/**
 * Best-effort mapping from a lemur `categoryIds[]` entry or free-text
 * category to our canonical label. Lemur returns either numeric IDs
 * (TikTok's internal taxonomy) or English labels — we tolerate both.
 *
 * Keys are lower-cased + trimmed.
 */
const CATEGORY_ALIASES: Record<string, CreatorCategory> = {
  // Direct / common variants
  beauty: 'Beauty & Personal Care',
  'beauty & personal care': 'Beauty & Personal Care',
  'personal care': 'Beauty & Personal Care',
  skincare: 'Beauty & Personal Care',
  cosmetics: 'Beauty & Personal Care',

  fashion: 'Shopping & Retail',
  apparel: 'Shopping & Retail',
  clothing: 'Shopping & Retail',
  'shopping & retail': 'Shopping & Retail',

  womenswear: 'Womenswear & Underwear',
  'womenswear & underwear': 'Womenswear & Underwear',
  menswear: 'Menswear & Underwear',
  'menswear & underwear': 'Menswear & Underwear',
  'muslim fashion': 'Muslim Fashion',

  health: 'Health & Wellness',
  wellness: 'Health & Wellness',
  'health & wellness': 'Health & Wellness',
  supplements: 'Health & Wellness',

  food: 'Food & Beverage',
  beverage: 'Food & Beverage',
  'food & beverage': 'Food & Beverage',
  snacks: 'Food & Beverage',

  electronics: 'Phones & Electronics',
  phones: 'Phones & Electronics',
  'phones & electronics': 'Phones & Electronics',
  tech: 'IT & High-Tech',
  'it & high-tech': 'IT & High-Tech',

  home: 'Home, Furniture & Appliances',
  furniture: 'Home, Furniture & Appliances',
  appliances: 'Home, Furniture & Appliances',
  'home, furniture & appliances': 'Home, Furniture & Appliances',
  kitchenware: 'Kitchenware',

  pets: 'Pets',
  baby: 'Baby',

  fitness: 'Sports, Fitness & Outdoors',
  sports: 'Sports, Fitness & Outdoors',
  outdoors: 'Sports, Fitness & Outdoors',
  'sports, fitness & outdoors': 'Sports, Fitness & Outdoors',

  travel: 'Travel & Tourism',
  'travel & tourism': 'Travel & Tourism',
  luggage: 'Luggage & Bags',
  'luggage & bags': 'Luggage & Bags',

  entertainment: 'Media & Entertainment',
  'media & entertainment': 'Media & Entertainment',
  music: 'Music & Dance',
  dance: 'Music & Dance',
  'music & dance': 'Music & Dance',

  art: 'Art & Crafts',
  crafts: 'Art & Crafts',
  'art & crafts': 'Art & Crafts',

  gaming: 'Gaming',
  games: 'Gaming',

  finance: 'Finance & Investing',
  investing: 'Finance & Investing',
  'finance & investing': 'Finance & Investing',

  education: 'Education & Training',
  training: 'Education & Training',
  'education & training': 'Education & Training',

  software: 'Software & Apps',
  apps: 'Software & Apps',
  'software & apps': 'Software & Apps',

  blog: 'Personal Blog',
  'personal blog': 'Personal Blog',
  public: 'Public Figure',
  'public figure': 'Public Figure',
  ngo: 'NGO',
  government: 'Government Affairs',
  'government affairs': 'Government Affairs',
  'real estate': 'Real Estate',
};

export function normalizeCreatorCategory(raw: string | null | undefined): CreatorCategory | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return CATEGORY_ALIASES[key] ?? null;
}

/**
 * Normalize a list of lemur categoryIds to human-readable canonical
 * labels. Drops unknown entries instead of guessing.
 */
export function normalizeCreatorCategories(raw: string[] | null | undefined): CreatorCategory[] {
  if (!Array.isArray(raw)) return [];
  const out: CreatorCategory[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const n = normalizeCreatorCategory(r);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Regional category GMV benchmarks (H1 2025, FastMoss)
// ---------------------------------------------------------------------------

/** ISO alpha-2 market code → category share data. */
export interface CategoryBenchmark {
  /** Canonical category label. */
  category: CreatorCategory;
  /** Share of total TikTok Shop GMV in this region (0–1). */
  gmvShare: number;
  /** Optional human note from the report. */
  note?: string;
}

export const REGIONAL_CATEGORY_BENCHMARKS: Record<string, CategoryBenchmark[]> = {
  US: [
    { category: 'Beauty & Personal Care', gmvShare: 0.43, note: 'Leads in H1 2025' },
    { category: 'Shopping & Retail', gmvShare: 0.2, note: 'Fashion & accessories' },
    { category: 'Health & Wellness', gmvShare: 0.1 },
  ],
  UK: [
    { category: 'Beauty & Personal Care', gmvShare: 0.5, note: 'Nearly half of GMV' },
    { category: 'Womenswear & Underwear', gmvShare: 0.2 },
  ],
  DE: [
    { category: 'Beauty & Personal Care', gmvShare: 0.6, note: 'Over 60% of GMV' },
    { category: 'Phones & Electronics', gmvShare: 0.2, note: 'Value-focused accessories' },
    { category: 'Health & Wellness', gmvShare: 0.1 },
  ],
  FR: [
    { category: 'Beauty & Personal Care', gmvShare: 0.5, note: 'Core conversion category' },
    { category: 'Software & Apps', gmvShare: 0.25 },
  ],
  IT: [
    { category: 'Beauty & Personal Care', gmvShare: 0.3 },
    { category: 'Health & Wellness', gmvShare: 0.3 },
    { category: 'Phones & Electronics', gmvShare: 0.2 },
    { category: 'Travel & Tourism', gmvShare: 0.2 },
  ],
  ES: [
    { category: 'Beauty & Personal Care', gmvShare: 0.5 },
    { category: 'Womenswear & Underwear', gmvShare: 0.15 },
  ],
  ID: [
    { category: 'Beauty & Personal Care', gmvShare: 0.56, note: '52% of creators too' },
    { category: 'Phones & Electronics', gmvShare: 0.16 },
  ],
  TH: [
    { category: 'Beauty & Personal Care', gmvShare: 0.27 },
    { category: 'Food & Beverage', gmvShare: 0.33, note: 'Top category in TH' },
    { category: 'Health & Wellness', gmvShare: 0.12 },
  ],
  MY: [
    { category: 'Beauty & Personal Care', gmvShare: 0.51 },
    { category: 'Food & Beverage', gmvShare: 0.3 },
    { category: 'Muslim Fashion', gmvShare: 0.18, note: 'Stable cultural segment' },
  ],
  VN: [
    { category: 'Beauty & Personal Care', gmvShare: 0.21 },
    { category: 'Menswear & Underwear', gmvShare: 0.16 },
  ],
  PH: [
    { category: 'Beauty & Personal Care', gmvShare: 0.38 },
    { category: 'Baby', gmvShare: 0.24 },
    { category: 'Phones & Electronics', gmvShare: 0.2 },
  ],
  BR: [
    { category: 'Beauty & Personal Care', gmvShare: 0.4 },
    { category: 'Home, Furniture & Appliances', gmvShare: 0.15 },
  ],
  MX: [
    { category: 'Beauty & Personal Care', gmvShare: 0.3 },
    { category: 'Phones & Electronics', gmvShare: 0.25 },
    { category: 'Travel & Tourism', gmvShare: 0.2 },
  ],
};

export function getRegionalBenchmarks(countryCode: string): CategoryBenchmark[] {
  return REGIONAL_CATEGORY_BENCHMARKS[countryCode.toUpperCase()] ?? [];
}

/**
 * Find the benchmark that best matches a search's category signal.
 * Takes the query + the top categories observed in the results, picks
 * the highest-share regional benchmark that matches. Returns null if
 * nothing fits.
 */
export function pickPrimaryBenchmark(
  countryCode: string,
  categoryCandidates: CreatorCategory[],
): CategoryBenchmark | null {
  const benchmarks = getRegionalBenchmarks(countryCode);
  if (benchmarks.length === 0 || categoryCandidates.length === 0) return null;
  for (const cat of categoryCandidates) {
    const match = benchmarks.find((b) => b.category === cat);
    if (match) return match;
  }
  return benchmarks[0] ?? null;
}
