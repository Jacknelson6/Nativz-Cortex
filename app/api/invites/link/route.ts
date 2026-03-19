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

    // Ensure user record has viewer role and an organization_id
    const { data: userData } = await adminClient
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single();

    // Set organization_id if not already set (keep existing for backwards compat)
    if (!userData?.organization_id) {
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
    }

    // Create user_client_access row for multi-brand support
    if (invite.client_id) {
      await adminClient
        .from('user_client_access')
        .upsert({
          user_id: user.id,
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
              user_id: user.id,
              client_id: c.id,
              organization_id: invite.organization_id,
            })),
            { onConflict: 'user_id,client_id' },
          );
      }
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
