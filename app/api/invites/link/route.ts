/**
 * POST /api/invites/link
 *
 * Link an authenticated user's existing account to an invite's organization.
 * Used when a client contact already has a Supabase account and clicks an invite link.
 *
 * @auth Required (any authenticated user)
 * @body token - Invite token string (required)
 * @returns {{ success: true }}
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token } = await request.json();
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Validate token
    const { data: invite } = await adminClient
      .from('invite_tokens')
      .select('id, organization_id, expires_at, used_at')
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

    // Check if user already belongs to an org
    const { data: userData } = await adminClient
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single();

    if (userData?.organization_id && userData.organization_id !== invite.organization_id) {
      return NextResponse.json(
        { error: 'Your account is already linked to a different organization' },
        { status: 409 },
      );
    }

    // Link user to the invite's organization and set role to viewer
    const { error: updateError } = await adminClient
      .from('users')
      .update({
        organization_id: invite.organization_id,
        role: 'viewer',
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to link user to organization:', updateError);
      return NextResponse.json({ error: 'Failed to link account' }, { status: 500 });
    }

    // Mark invite as used
    await adminClient
      .from('invite_tokens')
      .update({ used_at: new Date().toISOString(), used_by: user.id })
      .eq('id', invite.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/invites/link error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
