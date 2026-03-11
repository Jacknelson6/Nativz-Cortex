/**
 * POST /api/google/disconnect — Remove stored Google tokens
 */
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { disconnectGoogle } from '@/lib/google/auth';

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await disconnectGoogle(user.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/google/disconnect error:', err);
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }
}
