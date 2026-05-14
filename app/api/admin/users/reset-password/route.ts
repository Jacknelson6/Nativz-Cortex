import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandFromRequest } from '@/lib/agency/brand-from-request';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

/** POST /api/admin/users/reset-password — send password reset email (super_admin only) */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('users').select('is_super_admin').eq('id', user.id).single();
  if (!me?.is_super_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  // Use the admin client to generate a password reset link. Brand the
  // redirect to the agency the super_admin is operating from (request host)
  // so an AC admin's reset link lands on cortex.andersoncollaborative.com.
  const { brand } = getBrandFromRequest(req);
  const appUrl =
    process.env.NODE_ENV !== 'production'
      ? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
      : getCortexAppUrl(brand);
  const resetPage = `${appUrl}/reset-password`;
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: resetPage },
  });

  if (error) {
    console.error('Password reset link generation failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // IMPORTANT: do NOT return `action_link` here. It redirects through
  // Supabase's `/auth/v1/verify`, which hands back a PKCE `?code=...` URL.
  // The recipient's browser doesn't have the paired code_verifier cookie
  // (the link was minted server-side), so the exchange fails silently and
  // `/reset-password` hangs on "Validating your reset link…" forever.
  // Mirror `/api/auth/forgot-password`: hand the raw `hashed_token` to our
  // own reset page and let it call `verifyOtp` directly.
  const hashedToken = data?.properties?.hashed_token;
  if (!hashedToken) {
    console.error('[admin reset-password] No hashed_token in response');
    return NextResponse.json({ error: 'No reset token returned by Supabase' }, { status: 500 });
  }
  const resetLink = `${resetPage}?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`;

  return NextResponse.json({
    success: true,
    // Working URL that lands the recipient on our reset page with the OTP
    // hash ready to verify. Safe to paste into Slack / share with the user.
    reset_link: resetLink,
    message: 'Reset link generated. Share with the user or they can use forgot password.',
  });
}
