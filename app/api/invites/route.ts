/**
 * POST /api/invites
 *
 * Creates an invite token for a client. Admin only.
 * Body: { client_id: string }
 * Returns: { token, invite_url, expires_at }
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

    // Check admin role
    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { client_id } = await request.json();
    if (!client_id) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    // Get client + organization_id
    const { data: client } = await adminClient
      .from('clients')
      .select('id, name, organization_id')
      .eq('id', client_id)
      .single();

    if (!client || !client.organization_id) {
      return NextResponse.json({ error: 'Client not found or missing organization' }, { status: 404 });
    }

    // Create invite token
    const { data: invite, error } = await adminClient
      .from('invite_tokens')
      .insert({
        client_id: client.id,
        organization_id: client.organization_id,
        created_by: user.id,
      })
      .select('token, expires_at')
      .single();

    if (error) {
      console.error('Failed to create invite:', error);
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const inviteUrl = `${baseUrl}/portal/join/${invite.token}`;

    return NextResponse.json({
      token: invite.token,
      invite_url: inviteUrl,
      expires_at: invite.expires_at,
      client_name: client.name,
    });
  } catch (error) {
    console.error('POST /api/invites error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
