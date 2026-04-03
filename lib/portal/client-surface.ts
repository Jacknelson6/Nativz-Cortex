/**
 * Client portal surface: **Research** + **Settings** only.
 * Other portal routes redirect here (middleware) and are omitted from the sidebar.
 */
export const PORTAL_HOME_PATH = '/portal/search/new' as const;

const REDIRECT_HOME_PREFIXES: readonly string[] = [
  '/portal/dashboard',
  '/portal/notifications',
  '/portal/ideas',
  '/portal/calendar',
  '/portal/analyze',
  '/portal/knowledge',
  '/portal/nerd',
  '/portal/reports',
  '/portal/preferences',
  '/portal/brand',
];

export function shouldRedirectPortalToMinimalHome(pathname: string): boolean {
  if (pathname === '/portal' || pathname === '/portal/') return true;
  return REDIRECT_HOME_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
