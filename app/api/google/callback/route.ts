/**
 * GET /api/google/callback — OAuth callback handler
 */
import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode, storeTokens } from '@/lib/google/auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    if (error) {
      return NextResponse.redirect(`${baseUrl}/admin/settings?google=error&reason=${error}`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${baseUrl}/admin/settings?google=error&reason=missing_params`);
    }

    // Validate CSRF
    const [userId, csrf] = state.split(':');
    const cookieCsrf = request.cookies.get('google_oauth_state')?.value;

    if (!cookieCsrf || csrf !== cookieCsrf) {
      return NextResponse.redirect(`${baseUrl}/admin/settings?google=error&reason=csrf_mismatch`);
    }

    // Exchange code for tokens
    const tokens = await exchangeCode(code);

    // Extract email from id_token (JWT)
    let email = 'unknown';
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString());
        email = payload.email || 'unknown';
      } catch { /* fallback to userinfo */ }
    }

    // Fallback: fetch email from userinfo endpoint
    if (email === 'unknown') {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (userRes.ok) {
        const user = await userRes.json();
        email = user.email || 'unknown';
      }
    }

    // Store tokens
    await storeTokens(userId, email, tokens.access_token, tokens.refresh_token, tokens.expires_in);

    const response = NextResponse.redirect(`${baseUrl}/admin/settings?google=connected`);
    response.cookies.delete('google_oauth_state');
    return response;
  } catch (err) {
    console.error('GET /api/google/callback error:', err);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${baseUrl}/admin/settings?google=error&reason=exchange_failed`);
  }
}
