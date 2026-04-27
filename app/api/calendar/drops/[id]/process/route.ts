import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestDrop } from '@/lib/calendar/ingest-drop';
import { analyzeDropVideos } from '@/lib/calendar/analyze-video';
import { generateDropCaptions } from '@/lib/calendar/generate-caption';

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
    .select('id, client_id, created_by, status')
    .eq('id', id)
    .single();
  if (!drop) return NextResponse.json({ error: 'not found' }, { status: 404 });

  try {
    const ingest = await ingestDrop(admin, { dropId: id, userId: drop.created_by });
    if (ingest.processed === 0) {
      await admin
        .from('content_drops')
        .update({ status: 'failed', error_detail: 'All videos failed to ingest' })
        .eq('id', id);
      return NextResponse.json({ error: 'all videos failed to ingest' }, { status: 500 });
    }
    await admin
      .from('content_drops')
      .update({
        status: 'analyzing',
        processed_videos: ingest.processed,
        updated_at: new Date().toISOString(),
        error_detail: ingest.failed > 0 ? `${ingest.failed} video(s) failed during ingestion` : null,
      })
      .eq('id', id);

    const analysis = await analyzeDropVideos(admin, { dropId: id, userId: drop.created_by });
    if (analysis.analyzed === 0) {
      await admin
        .from('content_drops')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
          error_detail: 'All videos failed during analysis',
        })
        .eq('id', id);
      return NextResponse.json({ error: 'analysis produced no results', ingest, analysis }, { status: 500 });
    }
    await admin
      .from('content_drops')
      .update({
        status: 'generating',
        updated_at: new Date().toISOString(),
        error_detail: analysis.failed > 0 ? `${analysis.failed} video(s) failed during analysis` : null,
      })
      .eq('id', id);

    const captions = await generateDropCaptions(admin, {
      dropId: id,
      clientId: drop.client_id,
      userId: drop.created_by,
      userEmail: user.email ?? undefined,
    });
    await admin
      .from('content_drops')
      .update({
        status: captions.generated > 0 ? 'ready' : 'failed',
        updated_at: new Date().toISOString(),
        error_detail:
          captions.failed > 0 ? `${captions.failed} caption(s) failed to generate` : null,
      })
      .eq('id', id);

    return NextResponse.json({ ok: true, ingest, analysis, captions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Processing failed';
    await admin.from('content_drops').update({ status: 'failed', error_detail: message }).eq('id', id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
