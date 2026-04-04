import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWelcomeEmail } from '@/lib/email/resend';
import { detectAgencyFromHostname } from '@/lib/agency/detect';

/**
 * POST /api/team/invite/accept
 *
 * Accept a team invite link and create a new admin user account. Validates the token,
 * creates a Supabase auth user, inserts a users record with admin role, links the
 * team_members record, and marks the invite as used. Rolls back auth user creation
 * if the users table insert fails.
 *
 * @auth None (public — invite token provides authorization)
 * @body token - Invite token from the team_invite_tokens table (required)
 * @body full_name - New user's full name (required)
 * @body email - New user's email address (required)
 * @body password - New user's password (min 8 chars) (required)
 * @returns {{ success: true }}
 */
export async function POST(request: NextRequest) {
  try {
    const { token, full_name, email, password, role, alias_emails } = await request.json();

    if (!token || !full_name || !email || !password) {
      return NextResponse.json(
        { error: 'All fields are required: token, full_name, email, password' },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();

    // Validate token
    const { data: invite } = await adminClient
      .from('team_invite_tokens')
      .select('id, team_member_id, email, expires_at, used_at')
      .eq('token', token)
      .single();

    if (!invite) {
      return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });
    }

    if (invite.used_at) {
      return NextResponse.json({ error: 'This invite has already been used' }, { status: 400 });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invite has expired' }, { status: 400 });
    }

    // Detect agency brand from request hostname for user metadata
    const agency = detectAgencyFromHostname(request.headers.get('x-agency') ?? request.nextUrl.hostname);

    // Create Supabase auth user with agency in metadata for branded auth emails
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { agency },
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Ask your admin to link your existing account instead.' },
          { status: 409 },
        );
      }
      console.error('Auth user creation failed:', authError);
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
    }

    const userId = authData.user.id;

    // Create users table record with admin role
    const { error: userError } = await adminClient
      .from('users')
      .insert({
        id: userId,
        email,
        full_name,
        role: 'admin',
      });

    if (userError) {
      console.error('Users table insert failed:', userError);
      await adminClient.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: 'Failed to set up account' }, { status: 500 });
    }

    // Link team member and sync any updated fields (name, role, alias emails)
    const teamUpdate: Record<string, unknown> = {
      user_id: userId,
      full_name,
      updated_at: new Date().toISOString(),
    };
    if (role) teamUpdate.role = role;
    if (Array.isArray(alias_emails) && alias_emails.length > 0) {
      teamUpdate.alias_emails = alias_emails.filter((e: string) => e.trim());
    }

    const { error: linkError } = await adminClient
      .from('team_members')
      .update(teamUpdate)
      .eq('id', invite.team_member_id);

    if (linkError) {
      console.error('Failed to link team member:', linkError);
      // Non-fatal — account is created, linking can be done manually
    }

    // Mark invite as used
    await adminClient
      .from('team_invite_tokens')
      .update({ used_at: new Date().toISOString(), used_by: userId })
      .eq('id', invite.id);

    // Send welcome email (non-blocking)
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io'}/admin/login`;
    sendWelcomeEmail({ to: email, name: full_name, role: 'admin', loginUrl, agency }).catch((err) =>
      console.error('Welcome email failed:', err),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/team/invite/accept error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
