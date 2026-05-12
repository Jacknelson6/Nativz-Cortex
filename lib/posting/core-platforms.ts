/**
 * The four social platforms Cortex treats as the must-deliver baseline for
 * every active client. If a scheduled core-four leg doesn't ship on its
 * window, the daily delivery audit cron pages Jack. Non-core legs
 * (LinkedIn, X, Threads, etc.) ride the same publish pipeline but don't
 * gate the "did the brand post today?" check.
 *
 * Values match `social_profiles.platform` CHECK constraint (see migration
 * 011) and the `PLATFORM_LABEL` map in the connection-expired-watch cron.
 */
export const CORE_PLATFORMS = [
  'tiktok',
  'instagram',
  'youtube',
  'facebook',
] as const;

export type CorePlatform = (typeof CORE_PLATFORMS)[number];

export function isCorePlatform(value: string | null | undefined): value is CorePlatform {
  if (!value) return false;
  return (CORE_PLATFORMS as readonly string[]).includes(value);
}

export const CORE_PLATFORM_LABEL: Record<CorePlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
};
