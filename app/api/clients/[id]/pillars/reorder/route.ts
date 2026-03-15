import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const reorderSchema = z.object({
  pillar_ids: z.array(z.string().uuid()),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { pillar_ids } = parsed.data;
  const admin = createAdminClient();

  // Update sort_order for each pillar based on array index
  const updates = pillar_ids.map((pillarId, index) =>
    admin
      .from('content_pillars')
      .update({ sort_order: index })
      .eq('id', pillarId)
      .eq('client_id', id)
  );

  const results = await Promise.all(updates);

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error('Failed to reorder pillars:', failed.error);
    return NextResponse.json({ error: 'Failed to reorder pillars' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
