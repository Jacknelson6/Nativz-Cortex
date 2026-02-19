import { type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const runtime = 'nodejs';

export const config = {
  matcher: [
    '/',
    '/admin/:path*',
    '/portal/:path*',
    // Legacy routes (redirect to new paths)
    '/login',
    '/search/:path*',
    '/history',
  ],
};
