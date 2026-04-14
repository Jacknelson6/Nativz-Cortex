import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireBoardAccess } from '@/lib/moodboard/auth';

export const dynamic = 'force-dynamic';

const pointSchema = z.object({ x: z.number(), y: z.number() });
const createStrokeSchema = z.object({
  color: z.string().min(1).max(64),
  width: z.number().min(0.5).max(32).default(2),
  points: z.array(pointSchema).min(2).max(5000),
});

/**
 * GET /api/moodboard/boards/[id]/strokes
 * Returns all strokes for a board, oldest first so paint order is preserved.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const gate = await requireBoardAccess(id, user, admin);
  if (!gate.ok) return gate.response;

  const { data, error } = await admin
    .from('moodboard_strokes')
    .select('id, color, width, points, created_at')
    .eq('board_id', id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ strokes: data ?? [] });
}

/**
 * POST /api/moodboard/boards/[id]/strokes
 * Append a stroke. One row per stroke — point-per-row would be chatty.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const gate = await requireBoardAccess(id, user, admin);
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const parsed = createStrokeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid stroke', detail: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await admin
    .from('moodboard_strokes')
    .insert({
      board_id: id,
      created_by: user!.id,
      color: parsed.data.color,
      width: parsed.data.width,
      points: parsed.data.points,
    })
    .select('id, color, width, points, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stroke: data });
}

/**
 * DELETE /api/moodboard/boards/[id]/strokes
 * Either ?stroke_id=<uuid> to remove one stroke, or no query to clear all.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const gate = await requireBoardAccess(id, user, admin);
  if (!gate.ok) return gate.response;

  const strokeId = new URL(request.url).searchParams.get('stroke_id');
  const query = admin.from('moodboard_strokes').delete().eq('board_id', id);
  const { error } = strokeId ? await query.eq('id', strokeId) : await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
