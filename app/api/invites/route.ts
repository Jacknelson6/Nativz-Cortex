/**
 * GET /api/invites?client_id=X
 *
 * List all invite tokens for a client, with status info.
 *
 * POST /api/invites
 *
 * Create a portal invite token for a client. The token is used to generate a
 * join URL that allows a new portal user to register and be linked to the client's organization.
 *
 * @auth Required (admin)
 * @body client_id - Client UUID to create the invite for (required)
 * @returns {{ token: string, invite_url: string, expires_at: string, client_name: string }}
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const clientId = request.nextUrl.searchParams.get('client_id');
    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    const { data: invites, error } = await adminClient
      .from('invite_tokens')
      .select('id, token, expires_at, used_at, used_by, created_at, created_by')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch invites:', error);
      return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 });
    }

    // Enrich with used_by user info
    const usedByIds = (invites ?? []).filter(i => i.used_by).map(i => i.used_by);
    let usedByMap: Record<string, { email: string; full_name: string }> = {};
    if (usedByIds.length > 0) {
      const { data: usedByUsers } = await adminClient
        .from('users')
        .select('id, email, full_name')
        .in('id', usedByIds);
      for (const u of usedByUsers ?? []) {
        usedByMap[u.id] = { email: u.email, full_name: u.full_name };
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    const enriched = (invites ?? []).map(inv => {
      const now = new Date();
      const expired = new Date(inv.expires_at) < now;
      const status = inv.used_at ? 'used' : expired ? 'expired' : 'active';

      return {
        id: inv.id,
        token: inv.token,
        invite_url: `${baseUrl}/portal/join/${inv.token}`,
        status,
        expires_at: inv.expires_at,
        used_at: inv.used_at,
        used_by: inv.used_by ? usedByMap[inv.used_by] ?? null : null,
        created_at: inv.created_at,
      };
    });

    return NextResponse.json({ invites: enriched });
  } catch (error) {
    console.error('GET /api/invites error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
