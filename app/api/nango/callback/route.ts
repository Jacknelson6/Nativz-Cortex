import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const callbackSchema = z.object({
  connectionId: z.string().min(1, 'connectionId is required'),
});

/**
 * POST /api/nango/callback
 * Called by the frontend after nango.auth() popup completes.
 * Stores the Nango connectionId on the user record.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = callbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }

    const { connectionId } = parsed.data;
    const adminClient = createAdminClient();

    // Store the connectionId directly on the user record
    const { error: updateError } = await adminClient
      .from('users')
      .update({ nango_connection_id: connectionId })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to update nango_connection_id:', updateError);
      return NextResponse.json(
        { error: 'Failed to save calendar connection' },
        { status: 500 },
      );
    }

    // Also upsert into calendar_connections for backward compatibility
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

    return NextResponse.json({ ok: true, connectionId });
  } catch (error) {
    console.error('POST /api/nango/callback error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
