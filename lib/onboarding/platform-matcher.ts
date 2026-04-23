/**
 * Given a checklist item's task text, figure out whether it maps to one of
 * the supported social/analytics platforms. When it does, the public page
 * renders a branded connection card above the generic checklist —
 * platform icon, canonical 3-step instructions, deep link, one-tap
 * "Mark as granted" button.
 *
 * Intentionally zero-config: admins write their tasks naturally ("TikTok
 * account access"), and the card emerges. If the match ever gets wrong,
 * rename the task and the card vanishes.
 */

export type PlatformKey =
  | 'tiktok'
  | 'instagram'
  | 'meta_business'
  | 'facebook'
  | 'google_analytics'
  | 'google_ads'
  | 'youtube'
  | 'shopify'
  | 'klaviyo';

export type PlatformSpec = {
  key: PlatformKey;
  name: string;
  /** Gradient applied behind the icon tile. Tasteful dark-mode friendly. */
  gradient: string;
  /** 3 steps a client actually needs to do. */
  steps: string[];
  /** Deep link to the settings page where access is granted. */
  deepLink: string;
  /** One-line explanation of why access is needed. */
  why: string;
};

const SPECS: Record<PlatformKey, PlatformSpec> = {
  tiktok: {
    key: 'tiktok',
    name: 'TikTok',
    gradient: 'from-[#25F4EE] via-[#010101] to-[#FE2C55]',
    steps: [
      'Open TikTok Business Center',
      'Open your Asset List → Creators',
      'Add our agency email as a Standard Creator',
    ],
    deepLink: 'https://business.tiktok.com/',
    why: 'Lets us publish, pull analytics, and respond to comments.',
  },
  instagram: {
    key: 'instagram',
    name: 'Instagram',
    gradient: 'from-[#833AB4] via-[#E1306C] to-[#FCAF45]',
    steps: [
      'Open Meta Business Suite → Settings',
      'Under People, click Add people',
      'Enter our agency email with Manage Ads + Create Content permissions',
    ],
    deepLink: 'https://business.facebook.com/settings',
    why: 'Needed to post, reply to DMs, and read Insights.',
  },
  meta_business: {
    key: 'meta_business',
    name: 'Meta Business Manager',
    gradient: 'from-[#0866FF] via-[#0064E1] to-[#0A2540]',
    steps: [
      'Open Business Settings → Users → People',
      'Click Add, enter our agency email',
      'Assign Admin on your Ad Account + Pages',
    ],
    deepLink: 'https://business.facebook.com/settings/people',
    why: 'Admin on your Business Manager unlocks ads + pages + pixels.',
  },
  facebook: {
    key: 'facebook',
    name: 'Facebook Page',
    gradient: 'from-[#1877F2] via-[#0A5AD1] to-[#0A2540]',
    steps: [
      'Open your Facebook Page → Settings → Page Roles',
      'Type our agency email',
      'Assign Editor or Admin',
    ],
    deepLink: 'https://www.facebook.com/settings?tab=page_roles',
    why: 'Role on your Page so we can publish and respond.',
  },
  google_analytics: {
    key: 'google_analytics',
    name: 'Google Analytics',
    gradient: 'from-[#F9AB00] via-[#E37400] to-[#C74300]',
    steps: [
      'Open GA4 → Admin (bottom left)',
      'Property → Property access management',
      'Grant our agency email Viewer access',
    ],
    deepLink: 'https://analytics.google.com/analytics/web/',
    why: 'Read-only access to your traffic + conversion data.',
  },
  google_ads: {
    key: 'google_ads',
    name: 'Google Ads',
    gradient: 'from-[#4285F4] via-[#34A853] to-[#FBBC05]',
    steps: [
      'Open your Google Ads account → Tools & settings',
      'Access and security → Managers',
      'Accept our MCC link request',
    ],
    deepLink: 'https://ads.google.com/aw/overview',
    why: 'Link our MCC so we can launch + optimise campaigns.',
  },
  youtube: {
    key: 'youtube',
    name: 'YouTube',
    gradient: 'from-[#FF0000] via-[#C4302B] to-[#0A0A0A]',
    steps: [
      'Open YouTube Studio → Settings → Permissions',
      'Invite our agency email',
      'Assign Editor role',
    ],
    deepLink: 'https://studio.youtube.com/',
    why: 'Editor access so we can publish + read Analytics.',
  },
  shopify: {
    key: 'shopify',
    name: 'Shopify',
    gradient: 'from-[#96BF48] via-[#5E8E3E] to-[#0A3A0A]',
    steps: [
      'Open your Shopify admin → Settings → Users and permissions',
      'Click Add staff',
      'Enter our agency email with the recommended scopes',
    ],
    deepLink: 'https://admin.shopify.com/',
    why: 'Staff access to verify pixels + product feeds.',
  },
  klaviyo: {
    key: 'klaviyo',
    name: 'Klaviyo',
    gradient: 'from-[#201747] via-[#3F2A7C] to-[#6F4FD9]',
    steps: [
      'Open Klaviyo → Account → Users',
      'Click Add new user',
      'Enter our agency email with Owner or Admin role',
    ],
    deepLink: 'https://www.klaviyo.com/account',
    why: 'So we can verify flows + audit event tracking.',
  },
};

// Match order matters: more-specific patterns first so "Meta Business" doesn't
// get stolen by "Facebook".
const MATCHERS: Array<{ re: RegExp; key: PlatformKey }> = [
  { re: /\btiktok\b/i, key: 'tiktok' },
  { re: /\b(meta business|business manager|business suite|meta bm)\b/i, key: 'meta_business' },
  { re: /\binstagram\b/i, key: 'instagram' },
  { re: /\byoutube\b/i, key: 'youtube' },
  { re: /\bgoogle ads\b/i, key: 'google_ads' },
  { re: /\b(google analytics|ga4|gsc)\b/i, key: 'google_analytics' },
  { re: /\bshopify\b/i, key: 'shopify' },
  { re: /\bklaviyo\b/i, key: 'klaviyo' },
  { re: /\bfacebook\b/i, key: 'facebook' },
];

export function detectPlatform(task: string): PlatformSpec | null {
  for (const m of MATCHERS) {
    if (m.re.test(task)) return SPECS[m.key];
  }
  return null;
}
