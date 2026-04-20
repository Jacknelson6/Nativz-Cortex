import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTeamInviteEmail } from '@/lib/email/resend';
import { detectAgencyFromHostname } from '@/lib/agency/detect';

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const adminClient = createAdminClient();
  const { data: userData } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!userData || userData.role !== 'admin') return null;
  return user;
}

/**
 * POST /api/team/[id]/invite
 *
 * Generate a team invite token for a team member so they can create their own login account.
 * Expires any existing unused invite tokens for this member before creating a new one.
 * The team member must have an email address set and must not already have a linked account.
 *
 * @auth Required (admin)
 * @param id - Team member UUID
 * @returns {{ token: string, invite_url: string, expires_at: string, member_name: string }}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = createAdminClient();

    // Get team member
    const { data: member, error: memberError } = await adminClient
      .from('team_members')
      .select('id, full_name, email, user_id')
      .eq('id', id)
      .single();

    if (memberError || !member) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    if (member.user_id) {
      return NextResponse.json({ error: 'Team member already has a linked account' }, { status: 400 });
    }

    if (!member.email) {
      return NextResponse.json({ error: 'Team member has no email address. Add an email first.' }, { status: 400 });
    }

    // Expire any existing unused invites for this member
    await adminClient
      .from('team_invite_tokens')
      .update({ expires_at: new Date().toISOString() })
      .eq('team_member_id', id)
      .is('used_at', null);

    // Create new invite token
    const { data: invite, error: inviteError } = await adminClient
      .from('team_invite_tokens')
      .insert({
        team_member_id: id,
        email: member.email,
        created_by: admin.id,
      })
      .select('token, expires_at')
      .single();

    if (inviteError) {
      console.error('Failed to create team invite:', inviteError);
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const inviteUrl = `${baseUrl}/shared/join/${invite.token}`;

    // Get inviter's name for the email
    const { data: inviter } = await adminClient
      .from('users')
      .select('full_name')
      .eq('id', admin.id)
      .single();

    // Send invite email (non-blocking)
    const agencyHeader = request.headers.get('x-agency') ?? request.nextUrl.hostname;
    const agency = detectAgencyFromHostname(agencyHeader);
    sendTeamInviteEmail({
      to: member.email,
      memberName: member.full_name,
      inviteUrl,
      invitedBy: inviter?.full_name ?? 'The Nativz team',
      agency,
    }).catch((err) => console.error('Team invite email failed:', err));

    return NextResponse.json({
      token: invite.token,
      invite_url: inviteUrl,
      expires_at: invite.expires_at,
      member_name: member.full_name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('POST /api/team/[id]/invite error:', message, error instanceof Error ? error.stack : '');
    return NextResponse.json(
      { error: `Team invite failed: ${message}`, hint: 'Check server logs for the full stack trace.' },
      { status: 500 },
    );
  }
}
