import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabasePublishableKey, getSupabaseUrl } from './public-env';
import { PORTAL_HOME_PATH, shouldRedirectPortalToMinimalHome } from '@/lib/portal/client-surface';

export async function updateSession(request: NextRequest) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Public pages don't require auth
  if (pathname.startsWith('/join/') || pathname.startsWith('/shared/join/')) {
    return supabaseResponse;
  }

  // Login pages don't require auth
  if (pathname === '/login' || pathname === '/login') {
    if (user) {
      // Already logged in — redirect to appropriate dashboard
      if (pathname === '/login') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      }
      return NextResponse.redirect(new URL(PORTAL_HOME_PATH, request.url));
    }
    return supabaseResponse;
  }

  // Legacy routes — redirect to admin login
  if (pathname === '/' || pathname === '/login' || pathname === '/history' || pathname.startsWith('/search/')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // All other routes require auth
  if (!user) {
    if (pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (pathname.startsWith('/portal')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Role-based access control
  const role = await getUserRole(supabase, user.id);

  // Admin routes — only admins
  if (pathname.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(new URL(PORTAL_HOME_PATH, request.url));
  }

  // Portal routes — viewers (and admins can also access portal for testing)
  if (pathname.startsWith('/portal') && role !== 'viewer' && role !== 'admin') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (pathname.startsWith('/portal') && shouldRedirectPortalToMinimalHome(pathname)) {
    return NextResponse.redirect(new URL(PORTAL_HOME_PATH, request.url));
  }

  return supabaseResponse;
}

async function getUserRole(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  return data?.role || null;
}
