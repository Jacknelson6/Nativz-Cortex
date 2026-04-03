/**
 * POST /api/invites/accept
 *
 * Accept a portal invite token and register a new viewer account. Creates a Supabase Auth
 * user (email pre-confirmed) and a users table record with role 'viewer' linked to the
 * invite's organization. Marks the invite token as used. Rolls back the auth user if the
 * users table insert fails.
 *
 * @auth None (public endpoint)
 * @body token - Invite token string (required)
 * @body full_name - New user's full name (required)
 * @body email - New user's email address (required)
 * @body password - New user's password (min 8 chars, required)
 * @returns {{ success: true }}
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWelcomeEmail } from '@/lib/email/resend';

export async function POST(request: NextRequest) {
  try {
    const { token, full_name, email, password } = await request.json();

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
      .from('invite_tokens')
      .select('id, client_id, organization_id, expires_at, used_at')
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

    // Create Supabase auth user
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Try logging in instead.' },
          { status: 409 },
        );
      }
      console.error('Auth user creation failed:', authError);
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
    }

    const userId = authData.user.id;

    // Create users table record
    const { error: userError } = await adminClient
      .from('users')
      .insert({
        id: userId,
        email,
        full_name,
        role: 'viewer',
        organization_id: invite.organization_id,
      });

    if (userError) {
      console.error('Users table insert failed:', userError);
      // Clean up auth user if users table insert fails
      await adminClient.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: 'Failed to set up account' }, { status: 500 });
    }

    // Create user_client_access row for multi-brand support
    if (invite.client_id) {
      await adminClient
        .from('user_client_access')
        .upsert({
          user_id: userId,
          client_id: invite.client_id,
          organization_id: invite.organization_id,
        }, { onConflict: 'user_id,client_id' });
    } else {
      // Fallback: link to all active clients in the org
      const { data: orgClients } = await adminClient
        .from('clients')
        .select('id')
        .eq('organization_id', invite.organization_id)
        .eq('is_active', true);

      if (orgClients && orgClients.length > 0) {
        await adminClient
          .from('user_client_access')
          .upsert(
            orgClients.map((c) => ({
              user_id: userId,
              client_id: c.id,
              organization_id: invite.organization_id,
            })),
            { onConflict: 'user_id,client_id' },
          );
      }
    }

    // Mark invite as used — rollback if this fails
    const { error: usedAtError } = await adminClient
      .from('invite_tokens')
      .update({ used_at: new Date().toISOString(), used_by: userId })
      .eq('id', invite.id);

    if (usedAtError) {
      console.error('POST /api/invites/accept error: failed to mark invite used:', usedAtError);
      // Rollback: delete the users record and auth user
      await adminClient.from('users').delete().eq('id', userId);
      await adminClient.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: 'Failed to complete account setup' }, { status: 500 });
    }

    // Send welcome email (non-blocking)
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io'}/portal/login`;
    sendWelcomeEmail({ to: email, name: full_name, role: 'viewer', loginUrl }).catch((err) =>
      console.error('Welcome email failed:', err),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/invites/accept error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
