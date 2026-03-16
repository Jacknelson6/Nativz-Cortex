import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const pathname = request.nextUrl.pathname;

  // Public routes — no auth needed
  if (
    pathname.startsWith('/api/v1/') ||
    pathname.startsWith('/portal/join/') ||
    pathname.startsWith('/api/social/') ||
    pathname.startsWith('/shared/') ||
    pathname.startsWith('/api/shared/') ||
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/api/scheduler/webhooks') ||
    pathname.startsWith('/api/scheduler/connect/callback') ||
    pathname.startsWith('/api/calendar/webhook') ||
    pathname.startsWith('/api/monday/webhook') ||
    pathname.startsWith('/api/vault/webhook') ||
    pathname.startsWith('/api/nango/callback') ||
    pathname.startsWith('/api/google/callback')
  ) {
    return supabaseResponse;
  }

  // Login pages don't require auth
  if (pathname === '/admin/login' || pathname === '/portal/login') {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
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

  // Use getSession() for fast local JWT check (no network call).
  // Actual auth validation happens via getUser() in page/API routes.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (!user) {
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
      .select('role')
      .eq('id', user.id)
      .single();

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
