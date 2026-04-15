/**
 * Static app routes for E2E redirect / crawl coverage.
 * Dynamic segments ([slug], [id], …) are omitted — those are covered indirectly or via authenticated crawl.
 */

/** Expect unauthenticated session → final URL matches /admin/login */
export const ADMIN_PROTECTED_ROUTES: string[] = [
  '/admin/dashboard',
  '/admin/clients',
  '/admin/clients/new',
  '/admin/clients/onboard',
  '/admin/search/new',
  '/admin/settings',
  '/admin/settings/calendar',
  '/admin/settings/usage',
  '/admin/shoots',
  '/admin/calendar',
  '/admin/analytics',
  '/admin/analytics/social',
  '/admin/analytics/affiliates',
  '/admin/pipeline',
  '/admin/tasks',
  '/admin/meetings',
  '/admin/knowledge',
  '/admin/nerd',
  '/admin/nerd/api',
  '/admin/scheduler',
  '/admin/presentations',
  '/admin/ad-creatives',
  '/admin/team',
];

/** Expect unauthenticated session → final URL matches /portal/login */
export const PORTAL_PROTECTED_ROUTES: string[] = [
  '/portal/dashboard',
  '/portal/search/new',
  '/portal/reports',
  '/portal/settings',
  '/portal/preferences',
  '/portal/knowledge',
  '/portal/calendar',
  '/portal/notifications',
  '/portal/brand',
  '/portal/analyze',
  '/portal/nerd',
  '/portal/content-lab',
];

/** Logged-in portal crawl — minimal client surface (research + settings only). */
export const PORTAL_E2E_MINIMAL_STATIC_ROUTES: string[] = ['/portal/search/new', '/portal/settings'];

/**
 * Every static admin `page.tsx` (no `[param]`) — post-login E2E crawl.
 * Omits `/admin/analytics` — that route only `redirect()`s to `/admin/analytics/social`;
 * visiting both in sequence causes Playwright `net::ERR_ABORTED` on the second navigation.
 */
export const ADMIN_E2E_FULL_STATIC_ROUTES: string[] = [
  ...ADMIN_PROTECTED_ROUTES.filter((p) => p !== '/admin/analytics'),
  '/admin/content-lab',
];

/** Full portal static shells for post-login crawl. */
export const PORTAL_E2E_FULL_STATIC_ROUTES: string[] = [...PORTAL_E2E_MINIMAL_STATIC_ROUTES];
