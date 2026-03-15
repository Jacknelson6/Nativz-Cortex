import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const createPillarSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  emoji: z.string().optional(),
  example_series: z.array(z.string()).optional(),
  formats: z.array(z.string()).optional(),
  hooks: z.array(z.string()).optional(),
  frequency: z.string().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: pillars, error } = await admin
    .from('content_pillars')
    .select('*')
    .eq('client_id', id)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Failed to fetch pillars:', error);
    return NextResponse.json({ error: 'Failed to fetch pillars' }, { status: 500 });
  }

  return NextResponse.json({ pillars: pillars ?? [] });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = createPillarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get max sort_order for this client
  const { data: maxRow } = await admin
    .from('content_pillars')
    .select('sort_order')
    .eq('client_id', id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data: pillar, error } = await admin
    .from('content_pillars')
    .insert({
      client_id: id,
      ...parsed.data,
      sort_order: nextOrder,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create pillar:', error);
    return NextResponse.json({ error: 'Failed to create pillar' }, { status: 500 });
  }

  return NextResponse.json({ pillar });
}
