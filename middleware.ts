import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/public-env';
import { PORTAL_HOME_PATH, shouldRedirectPortalToMinimalHome } from '@/lib/portal/client-surface';
import { detectAgencyFromHostname, resolveAgencyForRequest } from '@/lib/agency/detect';
import { ADMIN_ACTIVE_CLIENT_COOKIE } from '@/lib/admin/get-active-client';

// Legacy Strategy Lab URLs like /admin/strategy-lab/<uuid> pre-date NAT-57's
// flatten to /admin/strategy-lab. The old page.tsx handled this with a client
// boot → POST /api/admin/active-client → router.replace, which cost ~1.5s of
// LCP on cold loads. This regex catches the legacy shape so middleware can
// set the cookie + 302 in one hop, before any RSC streams.
const LEGACY_STRATEGY_LAB_CLIENT_ID = /^\/admin\/strategy-lab\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/)?$/i;

// Same story for Ad Creatives: /admin/ad-creatives-v2/<uuid> was a client-side
// boot + POST + replace. Middleware sets the cookie and 302s to the flat
// /admin/ad-creatives URL in a single hop. Batch subpath has its own
// server-side redirect (see /admin/ad-creatives-v2/[clientId]/batches/[batchId])
// so we scope this regex to the parent shape only.
const LEGACY_AD_CREATIVES_CLIENT_ID = /^\/admin\/ad-creatives-v2\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/)?$/i;

type SupabaseFromMiddleware = ReturnType<typeof createServerClient>;

/**
 * Prefer getUser() (validates JWT with Supabase Auth). On Edge, that uses fetch and can
 * throw "fetch failed" (transient network, DNS, sandbox). Fall back to the cookie
 * session ONLY on thrown exceptions — not on auth errors like "JWT expired", which
 * the server-side layout's strict `getUser()` will agree is unauthenticated. Trusting
 * a stale session on expired JWTs caused a redirect loop: middleware sees a user via
 * the fallback, sends them to PORTAL_HOME_PATH; the portal layout's strict check sees
 * no user and sends them back to `/admin/login`.
 *
 * `skipNetworkValidation` = true reads the session cookie locally instead of the
 * `/auth/v1/user` round trip — used after a recent successful validation (tracked
 * by the `x-auth-fresh` cookie). Server component layouts call `getUser()` again,
 * so an expired JWT gets caught on the next hop regardless.
 */
async function getAuthUserResilient(
  supabase: SupabaseFromMiddleware,
  skipNetworkValidation = false,
): Promise<User | null> {
  if (skipNetworkValidation) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) return session.user;
      // No session cookie at all → fall through to full validation.
    } catch {
      // fall through
    }
  }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    // Network failure during JWT validation — fall back to session cookie for routing only.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.user ?? null;
    } catch {
      return null;
    }
  }
}

const AUTH_FRESH_COOKIE = 'x-auth-fresh';
const AUTH_FRESH_TTL_SEC = 60;

// ---------------------------------------------------------------------------
// CORS configuration — dynamic origin to support localhost + production
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = new Set([
  'https://cortex.nativz.io',
  'https://cortex.andersoncollaborative.com',
  'http://localhost:3000',
  'http://localhost:3001',
]);

function setCorsHeaders(response: NextResponse, requestOrigin?: string | null): void {
  // Allow the request's origin if it's in our allowlist, or any *.vercel.app preview
  let origin = 'https://cortex.nativz.io';
  if (requestOrigin) {
    if (ALLOWED_ORIGINS.has(requestOrigin) || requestOrigin.endsWith('.vercel.app')) {
      origin = requestOrigin;
    }
  }
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
}

// ---------------------------------------------------------------------------
// Rate-limit hint headers (informational — helps clients self-throttle)
// ---------------------------------------------------------------------------
function setRateLimitHeaders(response: NextResponse): void {
  response.headers.set('X-RateLimit-Limit', '100');
  response.headers.set('X-RateLimit-Remaining', '99');
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestOrigin = request.headers.get('origin');

  // -----------------------------------------------------------------------
  // CORS: handle preflight OPTIONS requests for API routes
  // -----------------------------------------------------------------------
  if (pathname.startsWith('/api/')) {
    if (request.method === 'OPTIONS') {
      const preflightResponse = new NextResponse(null, { status: 204 });
      setCorsHeaders(preflightResponse, requestOrigin);
      return preflightResponse;
    }
  }

  // -----------------------------------------------------------------------
  // Dev-only brand override — if `?brand=anderson|nativz` is present on a
  // localhost request, persist it as `cortex_dev_brand` so subsequent
  // navigation stays in that brand. Production never sets this cookie.
  // -----------------------------------------------------------------------
  const pendingBrandCookie =
    process.env.NODE_ENV !== 'production'
      ? (() => {
          const q = request.nextUrl.searchParams.get('brand');
          return q === 'anderson' || q === 'nativz' ? q : null;
        })()
      : null;

  let supabaseResponse = NextResponse.next({ request });
  if (pendingBrandCookie) {
    supabaseResponse.cookies.set('cortex_dev_brand', pendingBrandCookie, {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          // BUG 9: preserve x-pathname after cookie-triggered response recreation
          supabaseResponse.headers.set('x-pathname', pathname);
          supabaseResponse.headers.set('x-agency', resolveAgencyForRequest(request));
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Public routes — no auth needed
  if (
    pathname === '/api/health' ||
    pathname.startsWith('/api/v1/') ||
    pathname.startsWith('/portal/join/') ||
    pathname.startsWith('/api/social/') ||
    pathname.startsWith('/shared/') ||
    pathname.startsWith('/api/shared/') ||
    pathname.startsWith('/submit-payroll/') ||
    pathname.startsWith('/api/submit-payroll/') ||
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/api/scheduler/webhooks') ||
    pathname.startsWith('/api/scheduler/connect/callback') ||
    pathname.startsWith('/api/monday/webhook') ||
    pathname.startsWith('/api/vault/webhook') ||
    pathname.startsWith('/api/knowledge/webhook') ||
    pathname.startsWith('/api/google/callback') ||
    pathname.startsWith('/api/team/invite/validate') ||
    pathname.startsWith('/api/team/invite/accept') ||
    pathname.startsWith('/api/invites/validate') ||
    pathname.startsWith('/api/invites/accept') ||
    pathname.startsWith('/api/invites/link') ||
    pathname.startsWith('/api/auth/send-email') ||
    pathname.startsWith('/api/auth/forgot-password') ||
    // Public onboarding page + its share-token-gated API routes. The page
    // itself is server-rendered with the admin client after validating the
    // token; the /api/onboarding/public/* routes validate the token on every
    // write. Both need to work without a Supabase auth session because the
    // client has no account — the share token is the access credential.
    pathname.startsWith('/onboarding/') ||
    pathname.startsWith('/api/onboarding/public/')
  ) {
    if (pathname.startsWith('/api/')) {
      setCorsHeaders(supabaseResponse, requestOrigin);
      setRateLimitHeaders(supabaseResponse);
    }
    // BUG 9: expose pathname so portal layout can detect auth pages
    supabaseResponse.headers.set('x-pathname', pathname);
          supabaseResponse.headers.set('x-agency', resolveAgencyForRequest(request));
    return supabaseResponse;
  }

  // Password reset pages don't require auth
  if (
    pathname === '/admin/forgot-password' ||
    pathname === '/admin/reset-password' ||
    pathname === '/portal/forgot-password' ||
    pathname === '/portal/reset-password'
  ) {
    supabaseResponse.headers.set('x-pathname', pathname);
    supabaseResponse.headers.set('x-agency', resolveAgencyForRequest(request));
    return supabaseResponse;
  }

  // Login pages don't require auth. Use full JWT validation here so we never
  // accidentally redirect a user with an expired session back into the app.
  if (pathname === '/admin/login' || pathname === '/portal/login') {
    const loginUser = await getAuthUserResilient(supabase, false);
    if (loginUser) {
      if (pathname === '/admin/login') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      }
      return NextResponse.redirect(new URL(PORTAL_HOME_PATH, request.url));
    }
    // BUG 9: expose pathname so portal layout can detect auth pages
    supabaseResponse.headers.set('x-pathname', pathname);
          supabaseResponse.headers.set('x-agency', resolveAgencyForRequest(request));
    return supabaseResponse;
  }

  // Legacy routes — redirect to admin login
  if (pathname === '/' || pathname === '/login' || pathname === '/history' || pathname.startsWith('/search/')) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // Skip the network JWT validation when we've validated within the last
  // AUTH_FRESH_TTL_SEC seconds — saves 100-500ms per client-side nav.
  const authFresh = request.cookies.get(AUTH_FRESH_COOKIE)?.value === '1';
  const user = await getAuthUserResilient(supabase, authFresh);

  if (!user) {
    // JSON APIs must not redirect to HTML login — clients expect { error } and show "Request failed" on HTML.
    if (pathname.startsWith('/api/')) {
      const res = NextResponse.json(
        {
          error: 'Unauthorized',
          hint: 'Sign in again — your session may have expired.',
        },
        { status: 401 },
      );
      setCorsHeaders(res, requestOrigin);
      setRateLimitHeaders(res);
      return res;
    }
    // Unified login — all unauthenticated users go to /admin/login
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // Role-based access: use cached role from cookie if available.
  // The cookie also stores the user ID it was set for — if the user changed
  // (e.g. different account logged in), the cache is invalidated.
  const cachedRoleCookie = request.cookies.get('x-user-role')?.value || null;
  const cachedRoleUserId = request.cookies.get('x-user-role-uid')?.value || null;
  let role: string | null =
    cachedRoleCookie && cachedRoleUserId === user.id ? cachedRoleCookie : null;

  if (!role) {
    const { data: userData } = await supabase
      .from('users')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    // Block deactivated portal users
    if (userData?.is_active === false) {
      return NextResponse.redirect(new URL('/admin/login?error=deactivated', request.url));
    }

    role = userData?.role || null;

    // Cache role + user ID in cookies (10 min) to avoid DB lookups.
    // The user ID cookie lets us invalidate the cache when a different user logs in.
    if (role) {
      supabaseResponse.cookies.set('x-user-role', role, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600,
        path: '/',
      });
      supabaseResponse.cookies.set('x-user-role-uid', user.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600,
        path: '/',
      });
    }
  }

  // Refresh the auth-fresh marker whenever we went through the full
  // validation path (skipNetworkValidation=false). Subsequent navs within
  // AUTH_FRESH_TTL_SEC will skip the network round trip to Supabase Auth.
  if (!authFresh) {
    supabaseResponse.cookies.set(AUTH_FRESH_COOKIE, '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: AUTH_FRESH_TTL_SEC,
      path: '/',
    });
  }

  // Impersonation detection
  const isImpersonating = request.cookies.has('x-impersonate-org');

  // If admin navigates to an admin route while impersonating, clear impersonation cookies
  if (pathname.startsWith('/admin') && isImpersonating && role === 'admin') {
    supabaseResponse.cookies.delete('x-impersonate-org');
    supabaseResponse.cookies.delete('x-impersonate-slug');
    supabaseResponse.headers.set('x-pathname', pathname);
          supabaseResponse.headers.set('x-agency', resolveAgencyForRequest(request));
    return supabaseResponse;
  }

  // Admin routes — only admins
  if (pathname.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(new URL(PORTAL_HOME_PATH, request.url));
  }

  // Legacy /admin/strategy-lab/<uuid> → set active-client cookie + 302.
  // Replaces a client-side page that cost ~1.5s of LCP (boot + POST + RSC
  // refetch). Skips the API route's client-existence check; the downstream
  // page's getActiveAdminClient() falls back to general chat if the id is
  // stale, which is the same surface the old page ended up on.
  const legacyMatch = pathname.match(LEGACY_STRATEGY_LAB_CLIENT_ID);
  if (legacyMatch) {
    const clientId = legacyMatch[1];
    const target = new URL('/admin/strategy-lab', request.url);
    const attach = request.nextUrl.searchParams.get('attach');
    if (attach) target.searchParams.set('attach', attach);
    const redirect = NextResponse.redirect(target);
    redirect.cookies.set(ADMIN_ACTIVE_CLIENT_COOKIE, clientId, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 180,
    });
    return redirect;
  }

  // Legacy /admin/ad-creatives-v2/<uuid> → same treatment. Saves the
  // client-side boot + POST + router.replace hop for bookmarks, task
  // links, and task-attached creative history. Batch subpath has its
  // own server-side redirect (see the legacy batches page.tsx); this
  // branch only catches the parent URL.
  const legacyAcMatch = pathname.match(LEGACY_AD_CREATIVES_CLIENT_ID);
  if (legacyAcMatch) {
    const clientId = legacyAcMatch[1];
    const target = new URL('/admin/ad-creatives', request.url);
    const redirect = NextResponse.redirect(target);
    redirect.cookies.set(ADMIN_ACTIVE_CLIENT_COOKIE, clientId, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 180,
    });
    return redirect;
  }

  // Portal routes — viewers, or admins (incl. impersonation)
  if (pathname.startsWith('/portal')) {
    if (role !== 'viewer' && role !== 'admin') {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    if (shouldRedirectPortalToMinimalHome(pathname)) {
      return NextResponse.redirect(new URL(PORTAL_HOME_PATH, request.url));
    }
  }

  // -----------------------------------------------------------------------
  // Attach CORS + rate-limit headers to all API responses
  // -----------------------------------------------------------------------
  if (pathname.startsWith('/api/')) {
    setCorsHeaders(supabaseResponse, requestOrigin);
    setRateLimitHeaders(supabaseResponse);
  }

  // BUG 9: expose pathname so portal layout can detect auth pages
  supabaseResponse.headers.set('x-pathname', pathname);
          supabaseResponse.headers.set('x-agency', resolveAgencyForRequest(request));

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/',
    '/admin/:path*',
    '/portal',
    '/portal/:path*',
    '/shared/:path*',
    '/login',
    '/search/:path*',
    '/history',
    '/api/:path*',
  ],
};
