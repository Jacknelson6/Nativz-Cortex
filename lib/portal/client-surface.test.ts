import { describe, expect, it } from 'vitest';
import {
  PORTAL_HOME_PATH,
  shouldRedirectPortalToMinimalHome,
} from './client-surface';

/**
 * client-surface owns the portal-home redirect rule. It is consumed by
 * server-side guards that send a viewer landing on `/portal` or
 * `/portal/dashboard` straight to the topic-search-new screen.
 *
 * Invariants under test:
 *   1. PORTAL_HOME_PATH is the topic-search-new path (callers paste this
 *      verbatim into NextResponse.redirect, so a regression here breaks
 *      every redirect simultaneously).
 *   2. /portal and /portal/ both redirect.
 *   3. /portal/dashboard and /portal/dashboard/* redirect.
 *   4. Anything else (search, settings, calendar, etc.) does NOT redirect.
 *      A false positive here would create a redirect loop.
 */

describe('PORTAL_HOME_PATH', () => {
  it('is the topic-search-new path', () => {
    expect(PORTAL_HOME_PATH).toBe('/portal/search/new');
  });
});

describe('shouldRedirectPortalToMinimalHome', () => {
  it('redirects bare /portal', () => {
    expect(shouldRedirectPortalToMinimalHome('/portal')).toBe(true);
  });

  it('redirects /portal/ (trailing slash)', () => {
    expect(shouldRedirectPortalToMinimalHome('/portal/')).toBe(true);
  });

  it('redirects /portal/dashboard exact', () => {
    expect(shouldRedirectPortalToMinimalHome('/portal/dashboard')).toBe(true);
  });

  it('redirects /portal/dashboard/ (trailing slash on dashboard)', () => {
    expect(shouldRedirectPortalToMinimalHome('/portal/dashboard/')).toBe(true);
  });

  it('redirects deeper /portal/dashboard/* paths', () => {
    expect(shouldRedirectPortalToMinimalHome('/portal/dashboard/overview')).toBe(true);
    expect(shouldRedirectPortalToMinimalHome('/portal/dashboard/2/details')).toBe(true);
  });

  it('does NOT redirect the home target itself (would loop)', () => {
    expect(shouldRedirectPortalToMinimalHome('/portal/search/new')).toBe(false);
  });

  it('does NOT redirect other portal pages', () => {
    expect(shouldRedirectPortalToMinimalHome('/portal/search')).toBe(false);
    expect(shouldRedirectPortalToMinimalHome('/portal/settings')).toBe(false);
    expect(shouldRedirectPortalToMinimalHome('/portal/calendar')).toBe(false);
    expect(shouldRedirectPortalToMinimalHome('/portal/knowledge')).toBe(false);
    expect(shouldRedirectPortalToMinimalHome('/portal/reports/abc')).toBe(false);
  });

  it('does NOT redirect non-portal paths that happen to start with /portal-like prefixes', () => {
    expect(shouldRedirectPortalToMinimalHome('/portals')).toBe(false);
    expect(shouldRedirectPortalToMinimalHome('/portal-internal')).toBe(false);
  });

  it('does NOT redirect admin or root paths', () => {
    expect(shouldRedirectPortalToMinimalHome('/')).toBe(false);
    expect(shouldRedirectPortalToMinimalHome('/admin')).toBe(false);
    expect(shouldRedirectPortalToMinimalHome('/admin/dashboard')).toBe(false);
  });

  it('does NOT redirect paths that include "dashboard" elsewhere in the path', () => {
    expect(shouldRedirectPortalToMinimalHome('/portal/search/dashboard')).toBe(false);
    expect(shouldRedirectPortalToMinimalHome('/portal/settings/dashboard')).toBe(false);
  });
});
