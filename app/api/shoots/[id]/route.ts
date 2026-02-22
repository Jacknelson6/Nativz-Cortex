import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const patchSchema = z.object({
  client_id: z.string().uuid().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('shoot_events')
      .update({ client_id: parsed.data.client_id })
      .eq('id', id);

    if (error) {
      console.error('PATCH /api/shoots/[id] error:', error);
      return NextResponse.json({ error: 'Failed to update shoot event' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/shoots/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
