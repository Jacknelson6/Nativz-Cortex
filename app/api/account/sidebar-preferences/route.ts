/**
 * GET /api/account/sidebar-preferences   — current user's hidden sidebar items
 * PATCH /api/account/sidebar-preferences  — replace the list
 *
 * Stored on users.hidden_sidebar_items as a text[] of nav hrefs. Empty
 * list = show everything (default).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const patchSchema = z.object({
  hidden: z.array(z.string().min(1).max(200)).max(50),
});

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from('users')
    .select('hidden_sidebar_items')
    .eq('id', user.id)
    .single();

  return NextResponse.json({ hidden: (data?.hidden_sidebar_items ?? []) as string[] });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from('users')
    .update({ hidden_sidebar_items: parsed.data.hidden })
    .eq('id', user.id);

  if (error) {
    console.error('[account] sidebar-preferences PATCH failed', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, hidden: parsed.data.hidden });
}
