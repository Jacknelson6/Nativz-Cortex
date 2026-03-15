/**
 * GET /api/google
 *
 * Initiate the Google OAuth flow. Generates a CSRF token, stores it in a cookie, and
 * redirects the user to Google's consent screen. On completion, Google redirects to
 * /api/google/callback.
 *
 * @auth Required (any authenticated user)
 * @returns Redirect to Google OAuth consent screen
 */
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { buildAuthUrl, isGoogleConfigured } from '@/lib/google/auth';
import { randomBytes } from 'crypto';

export async function GET() {
  try {
    if (!isGoogleConfigured()) {
      return NextResponse.json({ error: 'Google integration not configured' }, { status: 503 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // State = userId:csrfToken (CSRF token stored in cookie)
    const csrf = randomBytes(16).toString('hex');
    const state = `${user.id}:${csrf}`;

    const url = buildAuthUrl(state);

    const response = NextResponse.redirect(url);
    response.cookies.set('google_oauth_state', csrf, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('GET /api/google error:', err);
    return NextResponse.json({ error: 'Failed to start OAuth' }, { status: 500 });
  }
}
