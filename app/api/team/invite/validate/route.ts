import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/team/invite/validate
 *
 * Validate a team invite token before the user fills out the accept form. Returns
 * metadata about the invite (email, member name and role) so the UI can pre-populate
 * fields. Includes a machine-readable `reason` field on error for UI branching.
 *
 * @auth None (public — token provides authorization)
 * @query token - Invite token from the team_invite_tokens table (required)
 * @returns {{ valid: true, email: string, member_name: string, member_role: string }}
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: invite } = await adminClient
      .from('team_invite_tokens')
      .select('id, email, expires_at, used_at, team_member_id, team_members(full_name, role)')
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

    const member = Array.isArray(invite.team_members)
      ? invite.team_members[0]
      : invite.team_members;

    return NextResponse.json({
      valid: true,
      email: invite.email,
      member_name: member?.full_name ?? '',
      member_role: member?.role ?? '',
    });
  } catch (error) {
    console.error('GET /api/team/invite/validate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
