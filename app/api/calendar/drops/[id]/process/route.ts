import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestDrop } from '@/lib/calendar/ingest-drop';

export const maxDuration = 300;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: drop } = await admin
    .from('content_drops')
    .select('id, created_by, status')
    .eq('id', id)
    .single();
  if (!drop) return NextResponse.json({ error: 'not found' }, { status: 404 });

  try {
    const { processed, failed } = await ingestDrop(admin, { dropId: id, userId: drop.created_by });
    await admin
      .from('content_drops')
      .update({
        status: failed === 0 && processed > 0 ? 'analyzing' : failed > 0 && processed === 0 ? 'failed' : 'analyzing',
        processed_videos: processed,
        updated_at: new Date().toISOString(),
        error_detail: failed > 0 ? `${failed} video(s) failed during ingestion` : null,
      })
      .eq('id', id);
    return NextResponse.json({ ok: true, processed, failed });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingestion failed';
    await admin.from('content_drops').update({ status: 'failed', error_detail: message }).eq('id', id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
