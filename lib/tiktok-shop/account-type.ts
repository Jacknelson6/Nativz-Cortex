/**
 * Classify a TikTok Shop account as creator / brand-store / agency-operated.
 *
 * Per FastMoss H1 2025, "top creator" rankings in every market include a
 * mix of real creators and brand-operated storefronts. Proportions vary
 * wildly — 70% creator in the US, 90% brand-store in Indonesia for top
 * performers. Pitching a brand-run storefront is a totally different
 * motion than pitching a real creator, so we expose the classification
 * as a derived field on every ranked creator.
 *
 * Classification is a best-effort heuristic on top of the lemur
 * enrichment — we don't have a definitive signal from the API. When the
 * heuristics are ambiguous we return 'unknown' rather than guess.
 */

import type { CreatorEnrichment } from './types';

export type AccountType = 'creator' | 'brand_store' | 'agency_operated' | 'unknown';

const BRAND_STORE_KEYWORDS = [
  'official',
  'officialshop',
  'officialstore',
  'store',
  'shop',
  'brand',
  'outlet',
  'flagship',
  'hq',
];

const BRAND_STORE_SUFFIXES = [
  '_official',
  '.official',
  '-official',
  '_store',
  '.store',
  '-store',
  '_shop',
  '.shop',
  '-shop',
  'store',
  'shop',
];

const REGION_TLDS = [
  '.id',
  '.my',
  '.us',
  '.uk',
  '.de',
  '.fr',
  '.it',
  '.es',
  '.br',
  '.mx',
  '.th',
  '.vn',
  '.ph',
  '.jp',
];

interface ClassifyInput {
  username: string;
  nickname: string | null;
  bio: string | null;
  enrichment: CreatorEnrichment | null;
}

export function classifyAccountType(input: ClassifyInput): AccountType {
  const uname = input.username.toLowerCase();
  const nick = (input.nickname ?? '').toLowerCase();
  const bio = (input.bio ?? '').toLowerCase();

  // Strong brand-store signals: username ends with a known store suffix
  // (e.g. "skintific.id", "xiaomi.indonesia", "gadgetgallery.ph"). These
  // patterns showed up repeatedly in the FastMoss top-50 lists.
  for (const suffix of BRAND_STORE_SUFFIXES) {
    if (uname.endsWith(suffix) && uname.length > suffix.length + 1) {
      return 'brand_store';
    }
  }

  // Region-tag suffix ("skintific.id") without "official/store" — still a
  // brand-storefront convention for Southeast Asia markets.
  for (const tld of REGION_TLDS) {
    if (uname.endsWith(tld) && uname.length > tld.length + 2) {
      return 'brand_store';
    }
  }

  // Keyword match on username or nickname
  for (const kw of BRAND_STORE_KEYWORDS) {
    if (uname.includes(kw) || nick.includes(kw)) {
      return 'brand_store';
    }
  }

  // Enrichment-based signals
  if (input.enrichment) {
    const s = input.enrichment.stats;

    // Very high promoted-product count with near-zero brand-collabs is a
    // tell for a brand-store account (it promotes only its own products).
    if (s.promotedProducts >= 20 && s.brandCollabs <= 1) {
      return 'brand_store';
    }

    // Bio mentions "official store/shop" explicitly
    if (/official\s+(store|shop|account)/i.test(bio)) {
      return 'brand_store';
    }
  }

  // Agency-operated: bio mentions an MCN or management contact. Light
  // touch — we don't want to over-claim on a bare "managed by" string.
  if (/\b(mcn|managed by|rep(?:resentation)?|agency)[:\s]/i.test(bio)) {
    return 'agency_operated';
  }

  // Default: real creator
  return input.enrichment ? 'creator' : 'unknown';
}

/** Small human-readable label for UI badges. */
export function accountTypeLabel(type: AccountType): string {
  switch (type) {
    case 'creator':
      return 'Creator';
    case 'brand_store':
      return 'Brand store';
    case 'agency_operated':
      return 'Agency-run';
    case 'unknown':
    default:
      return 'Unknown';
  }
}
