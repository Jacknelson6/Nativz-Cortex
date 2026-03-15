import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

const connectSchema = z.object({
  nango_connection_id: z.string().min(1, 'nango_connection_id is required'),
});

/**
 * GET /api/calendar/connect/[token]
 *
 * Public endpoint. Returns display metadata for a calendar invite link so the connect
 * page can show the contact's name and expiry information before the OAuth flow begins.
 *
 * @auth None (public)
 * @param token - Invite token from the calendar_connections row
 * @returns {{ contact_name: string, message: string, expires_at: string }}
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    const adminClient = createAdminClient();
    const { data: connection, error } = await adminClient
      .from('calendar_connections')
      .select('id, contact_id, display_name, expires_at, is_active, contacts(name)')
      .eq('invite_token', token)
      .single();

    if (error || !connection) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    if (new Date(connection.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite has expired' }, { status: 404 });
    }

    const contact = connection.contacts as unknown as { name: string } | null;
    const contact_name = contact?.name ?? connection.display_name ?? 'Client';

    return NextResponse.json({
      contact_name,
      message: 'You have been invited to connect your Google Calendar.',
      expires_at: connection.expires_at,
    });
  } catch (error) {
    console.error('GET /api/calendar/connect/[token] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/calendar/connect/[token]
 *
 * Public endpoint. Activates a calendar invite by linking the provided Nango connection ID
 * to the calendar_connections row identified by the token.
 *
 * @auth None (public)
 * @param token - Invite token from the calendar_connections row
 * @body nango_connection_id - Nango connection ID obtained after the OAuth flow (required)
 * @returns {{ success: true }}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    const body = await request.json();
    const parsed = connectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { nango_connection_id } = parsed.data;

    const adminClient = createAdminClient();
    const { data: connection, error: lookupError } = await adminClient
      .from('calendar_connections')
      .select('id, expires_at')
      .eq('invite_token', token)
      .single();

    if (lookupError || !connection) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    if (new Date(connection.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite has expired' }, { status: 404 });
    }

    const { error: updateError } = await adminClient
      .from('calendar_connections')
      .update({
        nango_connection_id,
        is_active: true,
      })
      .eq('id', connection.id);

    if (updateError) {
      console.error('POST /api/calendar/connect/[token] update error:', updateError);
      return NextResponse.json({ error: 'Failed to activate connection' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/calendar/connect/[token] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
