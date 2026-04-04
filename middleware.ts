import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/public-env';
import { PORTAL_HOME_PATH, shouldRedirectPortalToMinimalHome } from '@/lib/portal/client-surface';
import { detectAgencyFromHostname } from '@/lib/agency/detect';

type SupabaseFromMiddleware = ReturnType<typeof createServerClient>;

/**
 * Prefer getUser() (validates JWT with Supabase Auth). On Edge, that uses fetch and can
 * throw "fetch failed" (transient network, DNS, sandbox). Fall back to cookie session.
 */
async function getAuthUserResilient(supabase: SupabaseFromMiddleware): Promise<User | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!error && user) return user;
  } catch {
    // Network failure during JWT validation — session is still usable for routing
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CORS configuration — dynamic origin to support localhost + production
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = new Set([
  'https://cortex.nativz.io',
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

  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse.headers.set('x-agency', detectAgencyFromHostname(request.nextUrl.hostname));
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
    pathname.startsWith('/api/auth/send-email')
  ) {
    if (pathname.startsWith('/api/')) {
      setCorsHeaders(supabaseResponse, requestOrigin);
      setRateLimitHeaders(supabaseResponse);
    }
    // BUG 9: expose pathname so portal layout can detect auth pages
    supabaseResponse.headers.set('x-pathname', pathname);
          supabaseResponse.headers.set('x-agency', detectAgencyFromHostname(request.nextUrl.hostname));
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
    supabaseResponse.headers.set('x-agency', detectAgencyFromHostname(request.nextUrl.hostname));
    return supabaseResponse;
  }

  // Login pages don't require auth
  if (pathname === '/admin/login' || pathname === '/portal/login') {
    const loginUser = await getAuthUserResilient(supabase);
    if (loginUser) {
      if (pathname === '/admin/login') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      }
      return NextResponse.redirect(new URL(PORTAL_HOME_PATH, request.url));
    }
    // BUG 9: expose pathname so portal layout can detect auth pages
    supabaseResponse.headers.set('x-pathname', pathname);
          supabaseResponse.headers.set('x-agency', detectAgencyFromHostname(request.nextUrl.hostname));
    return supabaseResponse;
  }

  // Legacy routes — redirect to admin login
  if (pathname === '/' || pathname === '/login' || pathname === '/history' || pathname.startsWith('/search/')) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  const user = await getAuthUserResilient(supabase);

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
    if (pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    if (pathname.startsWith('/portal')) {
      return NextResponse.redirect(new URL('/portal/login', request.url));
    }
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
      if (pathname.startsWith('/portal')) {
        return NextResponse.redirect(new URL('/portal/login?error=deactivated', request.url));
      }
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

  // Impersonation detection
  const isImpersonating = request.cookies.has('x-impersonate-org');

  // If admin navigates to an admin route while impersonating, clear impersonation cookies
  if (pathname.startsWith('/admin') && isImpersonating && role === 'admin') {
    supabaseResponse.cookies.delete('x-impersonate-org');
    supabaseResponse.cookies.delete('x-impersonate-slug');
    supabaseResponse.headers.set('x-pathname', pathname);
          supabaseResponse.headers.set('x-agency', detectAgencyFromHostname(request.nextUrl.hostname));
    return supabaseResponse;
  }

  // Admin routes — only admins
  if (pathname.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(new URL(PORTAL_HOME_PATH, request.url));
  }

  // Portal routes — viewers, or admins (incl. impersonation)
  if (pathname.startsWith('/portal')) {
    if (role !== 'viewer' && role !== 'admin') {
      // BUG 10: unknown role on portal path should redirect to portal login, not admin login
      return NextResponse.redirect(new URL('/portal/login', request.url));
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
          supabaseResponse.headers.set('x-agency', detectAgencyFromHostname(request.nextUrl.hostname));

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
