import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const createSchema = z.object({
  client_id: z.string().uuid(),
  url: z.string().url().optional(),
  title: z.string().optional(),
  platform: z.string().optional(),
});

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('reference_videos')
    .insert({
      client_id: parsed.data.client_id,
      created_by: user.id,
      url: parsed.data.url ?? null,
      title: parsed.data.title ?? null,
      platform: parsed.data.platform ?? null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create reference video:', error);
    return NextResponse.json({ error: 'Failed to create reference video' }, { status: 500 });
  }

  return NextResponse.json({ video: data });
}

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('client_id');

  const admin = createAdminClient();
  let query = admin
    .from('reference_videos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data } = await query;
  return NextResponse.json({ videos: data ?? [] });
}
