/**
 * Meta Ad Library scrape via Apify actor curious_coder/facebook-ad-library-scraper
 * (actor id XtaWFhbtfxyzqrFmd). Takes the full Ad Library URL you'd paste in
 * your browser and returns a normalized snapshot: ad archive id, status,
 * media URLs, copy, landing URL.
 *
 * @see https://console.apify.com/actors/XtaWFhbtfxyzqrFmd/input
 */
import {
  fetchApifyDatasetItems,
  startApifyActorRun,
  waitForApifyRunSuccess,
} from '@/lib/tiktok/apify-run';

const DEFAULT_ACTOR = 'curious_coder/facebook-ad-library-scraper';
const DEFAULT_COUNT = 40;
const DEFAULT_MAX_WAIT_MS = 3 * 60 * 1000;
const DEFAULT_POLL_MS = 5_000;

function getActorId(): string {
  return (process.env.APIFY_META_ADS_ACTOR_ID ?? DEFAULT_ACTOR).trim();
}

function maxAds(): number {
  const raw = Number.parseInt(process.env.APIFY_META_ADS_MAX_ADS ?? '', 10);
  if (Number.isInteger(raw) && raw > 0) return raw;
  return DEFAULT_COUNT;
}

export interface MetaAdCreative {
  adArchiveId: string | null;
  isActive: boolean | null;
  startedOn: string | null; // YYYY-MM-DD
  endedOn: string | null;
  imageUrls: string[];
  videoUrls: string[];
  thumbnailUrl: string | null;
  bodyText: string | null;
  headline: string | null;
  ctaText: string | null;
  landingUrl: string | null;
  platforms: string[];
  raw: unknown;
}

// ─── URL helpers ───────────────────────────────────────────────────────────

export function extractPageIdFromLibraryUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get('view_all_page_id');
  } catch {
    return null;
  }
}

export function extractCountryFromLibraryUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const c = u.searchParams.get('country');
    return c && /^[A-Z]{2}$/.test(c) ? c : null;
  } catch {
    return null;
  }
}

// ─── Dataset normalisation ─────────────────────────────────────────────────

type RawApifyAd = {
  ad_archive_id?: string;
  adArchiveId?: string;
  id?: string;
  is_active?: boolean;
  isActive?: boolean;
  start_date?: number | string;
  startDate?: number | string;
  end_date?: number | string | null;
  endDate?: number | string | null;
  snapshot?: {
    body?: { text?: string };
    title?: string;
    cta_text?: string;
    link_url?: string;
    link_description?: string;
    images?: Array<{ original_image_url?: string; resized_image_url?: string }>;
    videos?: Array<{ video_hd_url?: string; video_sd_url?: string; video_preview_image_url?: string }>;
    cards?: Array<{ body?: string; title?: string; link_url?: string }>;
  };
  publisher_platform?: string[];
  ad_snapshot_url?: string;
  page_name?: string;
  categories?: string[];
};

function dateFromEpochSeconds(n: unknown): string | null {
  if (typeof n === 'number' && Number.isFinite(n)) {
    return new Date(n * 1000).toISOString().slice(0, 10);
  }
  if (typeof n === 'string') {
    const parsed = Date.parse(n);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  }
  return null;
}

export function normaliseMetaAdDatasetItems(items: unknown[]): MetaAdCreative[] {
  const out: MetaAdCreative[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const ad = raw as RawApifyAd;
    const snap = ad.snapshot ?? {};

    const imageUrls = Array.from(
      new Set(
        (snap.images ?? [])
          .map((img) => img.original_image_url ?? img.resized_image_url ?? null)
          .filter((u): u is string => Boolean(u)),
      ),
    );

    const videoUrls = Array.from(
      new Set(
        (snap.videos ?? [])
          .flatMap((v) => [v.video_hd_url, v.video_sd_url])
          .filter((u): u is string => Boolean(u)),
      ),
    );

    const videoThumb = (snap.videos ?? [])
      .map((v) => v.video_preview_image_url)
      .find((u): u is string => Boolean(u));

    out.push({
      adArchiveId: ad.ad_archive_id ?? ad.adArchiveId ?? ad.id ?? null,
      isActive: ad.is_active ?? ad.isActive ?? null,
      startedOn: dateFromEpochSeconds(ad.start_date ?? ad.startDate),
      endedOn: dateFromEpochSeconds(ad.end_date ?? ad.endDate),
      imageUrls,
      videoUrls,
      thumbnailUrl: imageUrls[0] ?? videoThumb ?? null,
      bodyText: snap.body?.text ?? null,
      headline: snap.title ?? null,
      ctaText: snap.cta_text ?? null,
      landingUrl: snap.link_url ?? null,
      platforms: Array.isArray(ad.publisher_platform) ? ad.publisher_platform : [],
      raw,
    });
  }
  return out;
}

// ─── Public entry ──────────────────────────────────────────────────────────

export async function scrapeMetaAdLibrary(opts: {
  libraryUrl: string;
  count?: number;
  maxWaitMs?: number;
}): Promise<MetaAdCreative[] | null> {
  const apiKey = process.env.APIFY_API_KEY?.trim();
  if (!apiKey) {
    console.error('[apify-meta-ads] APIFY_API_KEY not configured');
    return null;
  }

  const input = {
    urls: [{ url: opts.libraryUrl }],
    count: opts.count ?? maxAds(),
    // curious_coder's actor supports additional flags (proxyConfiguration, etc.)
    // Expose as env-driven extension when we need them.
  };

  const runId = await startApifyActorRun(getActorId(), input, apiKey);
  if (!runId) return null;

  const ok = await waitForApifyRunSuccess(
    runId,
    apiKey,
    opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS,
    DEFAULT_POLL_MS,
  );
  if (!ok) return null;

  const items = await fetchApifyDatasetItems(runId, apiKey, opts.count ?? maxAds());
  return normaliseMetaAdDatasetItems(items);
}
