import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/calendar/webhook
 *
 * Nango auth webhook — called by Nango when a user completes OAuth via Nango Connect.
 * Only processes auth creation events for the google-calendar provider. Upserts a
 * calendar_connections record with the nango_connection_id for the end user.
 *
 * @auth None (Nango webhook, no user auth)
 * @body type - Webhook event type (only 'auth' is processed)
 * @body operation - Operation type (only 'creation' is processed)
 * @body connectionId - Nango connection ID
 * @body providerConfigKey - Provider identifier (only 'google-calendar' is processed)
 * @body endUser.id - User ID to link the connection to
 * @returns {{ ok: true }}
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Nango sends different webhook types; we only care about auth events
    if (body.type !== 'auth' || body.operation !== 'creation') {
      return NextResponse.json({ ok: true });
    }

    const connectionId: string | undefined = body.connectionId;
    const providerConfigKey: string | undefined = body.providerConfigKey;
    const endUserId: string | undefined = body.endUser?.id;

    if (!connectionId || !providerConfigKey || !endUserId) {
      console.warn('Nango webhook missing fields:', { connectionId, providerConfigKey, endUserId });
      return NextResponse.json({ ok: true });
    }

    if (providerConfigKey !== 'google-calendar') {
      return NextResponse.json({ ok: true });
    }

    const adminClient = createAdminClient();

    // Upsert — if user already has a connection, update it
    const { data: existing } = await adminClient
      .from('calendar_connections')
      .select('id')
      .eq('user_id', endUserId)
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
        user_id: endUserId,
        provider: 'google',
        calendar_id: 'primary',
        nango_connection_id: connectionId,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('POST /api/calendar/webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
