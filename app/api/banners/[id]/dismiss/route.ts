/**
 * POST /api/banners/[id]/dismiss — user dismisses a banner durably.
 *
 * Stored in banner_dismissals so it survives across devices / browser sessions.
 * No-op when already dismissed.
 *
 * @auth Required (any authenticated user).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 10;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const admin = createAdminClient();
  const { error } = await admin
    .from('banner_dismissals')
    .upsert({ user_id: user.id, banner_id: id }, { onConflict: 'user_id,banner_id' });

  if (error) {
    console.error('[banners:dismiss] failed:', error);
    return NextResponse.json({ error: 'Failed to dismiss banner' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
