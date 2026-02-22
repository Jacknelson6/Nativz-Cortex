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
  if (pathname.startsWith('/portal/join/') || pathname === '/api/calendar/callback') {
    return supabaseResponse;
  }

  // Login pages don't require auth
  if (pathname === '/admin/login' || pathname === '/portal/login') {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
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

  // All other routes require auth
  const { data: { user } } = await supabase.auth.getUser();

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

  // Admin routes — only admins
  if (pathname.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(new URL('/portal/dashboard', request.url));
  }

  // Portal routes — viewers (and admins can also access portal for testing)
  if (pathname.startsWith('/portal') && role !== 'viewer' && role !== 'admin') {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/',
    '/admin/:path*',
    '/portal/:path*',
    '/login',
    '/search/:path*',
    '/history',
  ],
};
