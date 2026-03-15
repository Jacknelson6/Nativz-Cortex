import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; generationId: string }> }
) {
  const { id, generationId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: generation, error } = await admin
    .from('pillar_generations')
    .select('*')
    .eq('id', generationId)
    .eq('client_id', id)
    .single();

  if (error || !generation) {
    return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
  }

  // If completed, also fetch the client's pillars
  let pillars = null;
  if (generation.status === 'completed') {
    const { data: pillarData } = await admin
      .from('content_pillars')
      .select('*')
      .eq('client_id', id)
      .order('sort_order', { ascending: true });

    pillars = pillarData ?? [];
  }

  return NextResponse.json({ generation, pillars });
}
