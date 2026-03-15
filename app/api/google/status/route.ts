/**
 * GET /api/google/status
 *
 * Check whether the authenticated user has Google connected. Returns the connected email
 * address if connected, and whether the Google integration is configured at all.
 *
 * @auth Required (any authenticated user)
 * @returns {{ configured: boolean, connected: boolean, email: string | null }}
 */
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getGoogleConnection, isGoogleConfigured } from '@/lib/google/auth';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isGoogleConfigured()) {
      return NextResponse.json({ configured: false, connected: false });
    }

    const connection = await getGoogleConnection(user.id);
    return NextResponse.json({
      configured: true,
      connected: !!connection,
      email: connection?.email ?? null,
    });
  } catch (err) {
    console.error('GET /api/google/status error:', err);
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
  }
}
