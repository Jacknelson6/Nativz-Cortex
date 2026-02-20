import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Public pages don't require auth
  if (pathname.startsWith('/portal/join/')) {
    return supabaseResponse;
  }

  // Login pages don't require auth
  if (pathname === '/admin/login' || pathname === '/portal/login') {
    if (user) {
      // Already logged in — redirect to appropriate dashboard
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
  if (!user) {
    if (pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    if (pathname.startsWith('/portal')) {
      return NextResponse.redirect(new URL('/portal/login', request.url));
    }
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // Role-based access control
  const role = await getUserRole(supabase, user.id);

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
