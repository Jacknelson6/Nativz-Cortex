/**
 * Maps our internal PlatformKey (from lib/onboarding/platform-matcher) to a
 * Zernio-recognised platform slug for the hosted OAuth flow.
 *
 * Platforms Zernio doesn't cover (google_analytics, google_ads, shopify,
 * klaviyo) return null — those cards stay on the manual "I've granted
 * access" confirm path because there's no OAuth to offer.
 *
 * meta_business maps to facebook because Zernio's Facebook flow grants
 * Business Manager access + Pages in one shot.
 */
import type { PlatformKey } from '@/lib/onboarding/platform-matcher';
import type { SocialPlatform } from '@/lib/posting/types';

export function platformToZernio(platform: PlatformKey): SocialPlatform | null {
  switch (platform) {
    case 'tiktok':
      return 'tiktok';
    case 'instagram':
      return 'instagram';
    case 'facebook':
    case 'meta_business':
      return 'facebook';
    case 'youtube':
      return 'youtube';
    // No Zernio flow — manual confirm stays
    case 'google_analytics':
    case 'google_ads':
    case 'shopify':
    case 'klaviyo':
      return null;
  }
}

/** Reverse lookup for the webhook: Zernio platform → our PlatformKey list. */
export function zernioToPlatformKeys(zernio: string): PlatformKey[] {
  const lower = zernio.toLowerCase();
  switch (lower) {
    case 'tiktok':
      return ['tiktok'];
    case 'instagram':
      return ['instagram'];
    case 'facebook':
      // Could be a plain Facebook Page or the Business Manager grant.
      // Return both so the webhook ticks whichever matching item exists.
      return ['facebook', 'meta_business'];
    case 'youtube':
      return ['youtube'];
    case 'linkedin':
      return []; // no LinkedIn platform in our matcher yet
    case 'googlebusiness':
      return []; // same
    default:
      return [];
  }
}
