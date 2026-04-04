/**
 * Client portal surface home path.
 * The bare `/portal` and `/portal/dashboard` redirect here.
 */
export const PORTAL_HOME_PATH = '/portal/search/new' as const;

/** Paths that redirect to the portal home. Only the root + dashboard. */
const REDIRECT_HOME_PREFIXES: readonly string[] = [
  '/portal/dashboard',
];

export function shouldRedirectPortalToMinimalHome(pathname: string): boolean {
  if (pathname === '/portal' || pathname === '/portal/') return true;
  return REDIRECT_HOME_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
