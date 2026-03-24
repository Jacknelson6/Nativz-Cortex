import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/public-env';

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
    pathname.startsWith('/api/invites/link')
  ) {
    if (pathname.startsWith('/api/')) {
      setCorsHeaders(supabaseResponse, requestOrigin);
      setRateLimitHeaders(supabaseResponse);
    }
    return supabaseResponse;
  }

  // Login pages don't require auth
  if (pathname === '/admin/login' || pathname === '/portal/login') {
    const { data: { user: loginUser } } = await supabase.auth.getUser();
    if (loginUser) {
      if (pathname === '/admin/login') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      }
      return NextResponse.redirect(new URL('/portal/dashboard', request.url));
    }
    return supabaseResponse;
  }

  // Legacy routes — redirect to admin login
  if (pathname === '/' || pathname === '/login' || pathname === '/history' || pathname.startsWith('/search/')) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // Use getUser() for server-side JWT verification (validates with Supabase auth server).
  const { data: { user } } = await supabase.auth.getUser();

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

  // Role-based access: use cached role from cookie if available
  let role: string | null = request.cookies.get('x-user-role')?.value || null;

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

    // Cache role in a cookie (expires in 10 minutes) to avoid DB lookups
    if (role) {
      supabaseResponse.cookies.set('x-user-role', role, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
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
    return supabaseResponse;
  }

  // Admin routes — only admins
  if (pathname.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(new URL('/portal/dashboard', request.url));
  }

  // Portal routes — viewers, or admins impersonating a client
  if (pathname.startsWith('/portal')) {
    if (role === 'admin' && isImpersonating) {
      // Admin impersonating — allow portal access
      return supabaseResponse;
    }
    if (role !== 'viewer' && role !== 'admin') {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  // -----------------------------------------------------------------------
  // Attach CORS + rate-limit headers to all API responses
  // -----------------------------------------------------------------------
  if (pathname.startsWith('/api/')) {
    setCorsHeaders(supabaseResponse, requestOrigin);
    setRateLimitHeaders(supabaseResponse);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/',
    '/admin/:path*',
    '/portal/:path*',
    '/shared/:path*',
    '/login',
    '/search/:path*',
    '/history',
    '/api/:path*',
  ],
};
