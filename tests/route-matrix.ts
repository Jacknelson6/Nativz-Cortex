/**
 * Static app routes for E2E redirect / crawl coverage.
 * Dynamic segments ([slug], [id], …) are omitted — those are covered indirectly or via authenticated crawl.
 *
 * Phase 2 of the brand-root migration unified admin + viewer surfaces under
 * the `(app)/*` shell. /portal/* is retired; what's left is auth flows
 * (forgot-password, reset-password, join) and a redirect stub for /portal/login.
 */

/** Expect unauthenticated session → final URL matches /login */
export const ADMIN_PROTECTED_ROUTES: string[] = [
  '/admin/dashboard',
  '/admin/clients',
  '/admin/clients/new',
  '/admin/clients/onboard',
  '/finder/new',
  '/admin/settings',
  '/admin/settings/calendar',
  '/admin/settings/usage',
  '/admin/scheduling',
  '/admin/analytics',
  '/admin/analytics/social',
  '/admin/analytics/affiliates',
  '/admin/pipeline',
  '/admin/meetings',
  '/brain',
  '/admin/nerd',
  '/admin/nerd/api',
  '/admin/scheduler',
  '/admin/presentations',
  '/ads',
  '/admin/tools',
  '/admin/users',
  '/admin/accounting',
  '/admin/accounting/year',
  '/admin/notifications',
  '/admin/competitor-tracking/ecom',
  '/admin/competitor-tracking/meta-ads',
];

/**
 * Viewer-accessible brand surfaces in the unified `(app)/*` shell. Used by
 * the post-login viewer crawl. Anything cost-driving (spying, ads,
 * finder/monitors) is admin-only and lives in ADMIN_PROTECTED_ROUTES.
 */
export const VIEWER_PROTECTED_ROUTES: string[] = [
  '/finder/new',
  '/lab',
  '/brain',
  '/notes',
  '/brand-profile',
];

/** Logged-in viewer crawl — minimal surface (research + brand profile). */
export const VIEWER_E2E_MINIMAL_STATIC_ROUTES: string[] = ['/finder/new', '/brand-profile'];

/**
 * Every static admin `page.tsx` (no `[param]`) — post-login E2E crawl.
 * Omits `/admin/analytics` — that route only `redirect()`s to `/admin/analytics/social`;
 * visiting both in sequence causes Playwright `net::ERR_ABORTED` on the second navigation.
 */
export const ADMIN_E2E_FULL_STATIC_ROUTES: string[] = [
  ...ADMIN_PROTECTED_ROUTES.filter((p) => p !== '/admin/analytics'),
  '/lab',
];

/** Full viewer static shells for post-login crawl. */
export const VIEWER_E2E_FULL_STATIC_ROUTES: string[] = [...VIEWER_PROTECTED_ROUTES];

// Back-compat aliases — the old PORTAL_* exports are kept for any test
// helper still importing under the old name. New tests should use the
// VIEWER_* exports above.
export const PORTAL_PROTECTED_ROUTES = VIEWER_PROTECTED_ROUTES;
export const PORTAL_E2E_MINIMAL_STATIC_ROUTES = VIEWER_E2E_MINIMAL_STATIC_ROUTES;
export const PORTAL_E2E_FULL_STATIC_ROUTES = VIEWER_E2E_FULL_STATIC_ROUTES;
