/**
 * Curated brands often cited for polished Meta (Facebook/Instagram) image ads.
 * There is no official API “leaderboard” — Meta Ad Library is searched by brand name.
 * Use these as **starting points** for vertical-aligned creative references; the AI step
 * picks a subset that matches the client’s category.
 */
export type AdvertiserCategory =
  | 'beauty_skincare'
  | 'apparel'
  | 'food_beverage'
  | 'fitness'
  | 'saas_b2b'
  | 'home_goods'
  | 'pets'
  | 'finance'
  | 'travel'
  | 'general_dtc';

export interface ReferenceAdvertiser {
  name: string;
  categories: AdvertiserCategory[];
  /** Short note for the model */
  note?: string;
}

export const REFERENCE_ADVERTISERS: ReferenceAdvertiser[] = [
  { name: 'Glossier', categories: ['beauty_skincare'], note: 'Minimal product-forward statics' },
  { name: 'Rare Beauty', categories: ['beauty_skincare'] },
  { name: 'Oatly', categories: ['food_beverage'], note: 'Bold typographic statics' },
  { name: 'Liquid Death', categories: ['food_beverage'] },
  { name: 'Casper', categories: ['home_goods', 'general_dtc'] },
  { name: 'Warby Parker', categories: ['apparel', 'general_dtc'] },
  { name: 'Allbirds', categories: ['apparel'] },
  { name: 'Outdoor Voices', categories: ['apparel', 'fitness'] },
  { name: 'Gymshark', categories: ['fitness', 'apparel'] },
  { name: 'Peloton', categories: ['fitness'] },
  { name: 'Hims', categories: ['beauty_skincare', 'general_dtc'] },
  { name: 'Oura', categories: ['fitness', 'saas_b2b'] },
  { name: 'Notion', categories: ['saas_b2b'] },
  { name: 'Slack', categories: ['saas_b2b'] },
  { name: 'Mailchimp', categories: ['saas_b2b'] },
  { name: 'Monday.com', categories: ['saas_b2b'] },
  { name: 'Chewy', categories: ['pets'] },
  { name: 'BarkBox', categories: ['pets'] },
  { name: 'Away', categories: ['travel', 'general_dtc'] },
  { name: 'Chime', categories: ['finance'] },
  { name: 'Klarna', categories: ['finance', 'general_dtc'] },
  { name: 'Athletic Greens', categories: ['food_beverage', 'fitness'] },
  { name: 'HelloFresh', categories: ['food_beverage'] },
  { name: 'FIGS', categories: ['apparel'], note: 'Medical apparel — strong lifestyle statics' },
];

export function metaAdLibrarySearchUrl(brandName: string, country = 'US'): string {
  const q = encodeURIComponent(brandName.trim());
  return `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&q=${q}`;
}

/** Compact list for LLM context (names + categories). */
export function formatReferenceAdvertisersForPrompt(): string {
  return REFERENCE_ADVERTISERS.map(
    (a) => `- ${a.name} [${a.categories.join(', ')}]${a.note ? ` — ${a.note}` : ''}`,
  ).join('\n');
}
