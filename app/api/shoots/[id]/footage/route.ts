/**
 * PATCH /api/shoots/[id]/footage
 *
 * Update raw footage status for a shoot event.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const footageSchema = z.object({
  raw_footage_uploaded: z.boolean(),
  raw_footage_url: z.string().url().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

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
    const parsed = footageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const update: Record<string, unknown> = {
      raw_footage_uploaded: parsed.data.raw_footage_uploaded,
    };

    if (parsed.data.raw_footage_url !== undefined) {
      update.raw_footage_url = parsed.data.raw_footage_url;
    }

    if (parsed.data.raw_footage_uploaded) {
      update.raw_footage_uploaded_at = new Date().toISOString();
    }

    const { error: updateError } = await adminClient
      .from('shoot_events')
      .update(update)
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/shoots/[id]/footage error:', error);
    return NextResponse.json({ error: 'Failed to update footage status' }, { status: 500 });
  }
}
