import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const DISPLAY_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#06b6d4',
  '#84cc16',
  '#f43f5e',
  '#14b8a6',
];

const inviteSchema = z.object({
  contact_id: z.string().uuid('contact_id must be a valid UUID'),
});

/**
 * POST /api/calendar/invite
 *
 * Generate a calendar invite link for a contact. Creates a calendar_connections record with
 * a 32-char hex token and 30-day expiry, returning the shareable URL for the client to
 * connect their Google Calendar.
 *
 * @auth Required (admin)
 * @body contact_id - Contact UUID to generate the invite for (required)
 * @returns {{ token: string, url: string }} Invite token and full shareable URL
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { contact_id } = parsed.data;

    // Look up the contact's name for display_name
    const { data: contact, error: contactError } = await adminClient
      .from('contacts')
      .select('id, name')
      .eq('id', contact_id)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Auto-assign a display color — pick one at random from the palette
    const display_color = DISPLAY_COLORS[Math.floor(Math.random() * DISPLAY_COLORS.length)];

    const invite_token = randomBytes(16).toString('hex'); // 32-char hex
    const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: insertError } = await adminClient
      .from('calendar_connections')
      .insert({
        contact_id,
        invite_token,
        connection_type: 'client',
        expires_at,
        is_active: false,
        display_name: contact.name ?? null,
        display_color,
      });

    if (insertError) {
      console.error('POST /api/calendar/invite insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const url = `${appUrl}/shared/calendar-connect/${invite_token}`;

    return NextResponse.json({ token: invite_token, url });
  } catch (error) {
    console.error('POST /api/calendar/invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
