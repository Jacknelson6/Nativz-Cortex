import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { exchangeCodeForTokens, encryptToken } from '@/lib/google/auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // user ID
    const error = searchParams.get('error');

    if (error) {
      // User denied access
      return NextResponse.redirect(
        new URL('/admin/settings/calendar?error=denied', request.url),
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/admin/settings/calendar?error=missing_params', request.url),
      );
    }

    // Exchange authorization code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Encrypt tokens before storing
    const accessTokenEncrypted = await encryptToken(tokens.access_token);
    const refreshTokenEncrypted = tokens.refresh_token
      ? await encryptToken(tokens.refresh_token)
      : '';

    if (!refreshTokenEncrypted) {
      return NextResponse.redirect(
        new URL('/admin/settings/calendar?error=no_refresh_token', request.url),
      );
    }

    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Store connection in DB
    const adminClient = createAdminClient();

    // Upsert — if user already has a connection, update it
    const { data: existing } = await adminClient
      .from('calendar_connections')
      .select('id')
      .eq('user_id', state)
      .eq('provider', 'google')
      .single();

    if (existing) {
      await adminClient
        .from('calendar_connections')
        .update({
          access_token_encrypted: accessTokenEncrypted,
          refresh_token_encrypted: refreshTokenEncrypted,
          token_expires_at: tokenExpiresAt,
          connected_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await adminClient.from('calendar_connections').insert({
        user_id: state,
        provider: 'google',
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        token_expires_at: tokenExpiresAt,
        calendar_id: 'primary',
      });
    }

    return NextResponse.redirect(
      new URL('/admin/settings/calendar?success=connected', request.url),
    );
  } catch (error) {
    console.error('GET /api/calendar/callback error:', error);
    return NextResponse.redirect(
      new URL('/admin/settings/calendar?error=exchange_failed', request.url),
    );
  }
}
