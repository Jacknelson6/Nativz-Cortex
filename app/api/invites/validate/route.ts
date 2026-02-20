/**
 * GET /api/invites/validate?token=...
 *
 * Validates an invite token (public endpoint, no auth required).
 * Returns client name if valid, or an error reason.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Token required', reason: 'invalid' }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: invite } = await adminClient
    .from('invite_tokens')
    .select('id, client_id, expires_at, used_at, clients(name)')
    .eq('token', token)
    .single();

  if (!invite) {
    return NextResponse.json({ error: 'Invalid invite', reason: 'invalid' }, { status: 404 });
  }

  if (invite.used_at) {
    return NextResponse.json({ error: 'Invite already used', reason: 'used' }, { status: 400 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Invite expired', reason: 'expired' }, { status: 400 });
  }

  const clientData = Array.isArray(invite.clients) ? invite.clients[0] : invite.clients;

  return NextResponse.json({
    valid: true,
    client_name: clientData?.name || 'Unknown',
  });
}
