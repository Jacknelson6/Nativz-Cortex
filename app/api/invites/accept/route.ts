/**
 * POST /api/invites/accept
 *
 * Accepts an invite token and creates a new portal user.
 * Body: { token, full_name, email, password }
 * Returns: { success: true }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

    // Mark invite as used
    await adminClient
      .from('invite_tokens')
      .update({ used_at: new Date().toISOString(), used_by: userId })
      .eq('id', invite.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/invites/accept error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
