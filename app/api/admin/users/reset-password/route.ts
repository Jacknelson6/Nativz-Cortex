import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

  // Use the admin client to generate a password reset link
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io';
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${appUrl}/admin/reset-password` },
  });

  if (error) {
    console.error('Password reset link generation failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The admin generateLink returns the link directly — we can either
  // send it via our own email system or return it for the super_admin to share
  const resetLink = data?.properties?.action_link;

  return NextResponse.json({
    success: true,
    // Return the link so super_admin can share it directly
    reset_link: resetLink ?? null,
    message: resetLink
      ? 'Reset link generated. Share with the user or they can use forgot password.'
      : 'Reset email sent.',
  });
}
