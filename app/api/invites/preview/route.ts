/**
 * GET /api/invites/preview?client_id=X&name=Jane
 *
 * Returns the rendered HTML of the branded client-portal invite email for
 * the given client. Used by the admin invite dialog so admins can see
 * exactly what the recipient will receive (agency theming auto-resolved
 * from the client's `agency` field). No email is sent.
 *
 * @auth Required (admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildClientInviteEmailHtml } from '@/lib/email/resend';
import { getBrandFromAgency } from '@/lib/agency/use-agency-brand';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const { data: userData } = await adminClient
    .from('users')
    .select('role, full_name, email')
    .eq('id', user.id)
    .single();

  if (userData?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const clientId = request.nextUrl.searchParams.get('client_id');
  const previewName = request.nextUrl.searchParams.get('name')?.trim() || 'Jane';

  if (!clientId) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
  }

  const { data: client } = await adminClient
    .from('clients')
    .select('id, name, agency')
    .eq('id', clientId)
    .single();

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const invitedBy = userData?.full_name?.trim() || userData?.email || 'your team';
  const agency = getBrandFromAgency(client.agency);

  const html = buildClientInviteEmailHtml({
    contactName: previewName,
    clientName: client.name,
    inviteUrl: `${request.nextUrl.origin}/join/preview-token`,
    invitedBy,
    agency,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}
