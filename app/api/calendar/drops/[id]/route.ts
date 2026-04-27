import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: drop, error } = await supabase
    .from('content_drops')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !drop) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: videos } = await supabase
    .from('content_drop_videos')
    .select('*')
    .eq('drop_id', id)
    .order('order_index');

  return NextResponse.json({ drop, videos: videos ?? [] });
}
