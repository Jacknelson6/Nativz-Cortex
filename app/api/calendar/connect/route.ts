import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createConnectSession, isNangoConfigured } from '@/lib/nango/client';
import { z } from 'zod';

/**
 * GET — Create a Nango connect session and return the token for the frontend popup.
 */
export async function GET() {
  try {
    if (!isNangoConfigured()) {
      return NextResponse.json(
        { error: 'Google Calendar integration is not configured' },
        { status: 503 },
      );
    }

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

    const session = await createConnectSession(user.id);

    return NextResponse.json({ token: session.token });
  } catch (error) {
    console.error('GET /api/calendar/connect error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const confirmSchema = z.object({
  connectionId: z.string().min(1),
});

/**
 * POST — Called by the frontend after nango.auth() succeeds.
 * Stores the Nango connectionId in our calendar_connections table.
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
    const parsed = confirmSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'connectionId is required' }, { status: 400 });
    }

    const { connectionId } = parsed.data;

    // Upsert — if user already has a connection, update it
    const { data: existing } = await adminClient
      .from('calendar_connections')
      .select('id')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single();

    if (existing) {
      await adminClient
        .from('calendar_connections')
        .update({
          nango_connection_id: connectionId,
          connected_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await adminClient.from('calendar_connections').insert({
        user_id: user.id,
        provider: 'google',
        calendar_id: 'primary',
        nango_connection_id: connectionId,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('POST /api/calendar/connect error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
