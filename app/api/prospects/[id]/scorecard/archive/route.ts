// SPY-04 T16: archive a prospect share link.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const Schema = z.object({
  token: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: userData } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const { id } = await params;
    const { error: updateError } = await admin
      .from('prospect_share_links')
      .update({ archived_at: new Date().toISOString() })
      .eq('prospect_id', id)
      .eq('token', parsed.data.token);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/prospects/[id]/scorecard/archive error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
