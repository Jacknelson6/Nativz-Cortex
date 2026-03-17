import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const slideSchema = z.object({
  title: z.string().default(''),
  body: z.string().default(''),
  image_url: z.string().optional().nullable(),
  embed_url: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const tierDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});

const tierItemSchema = z.object({
  id: z.string(),
  url: z.string().default(''),
  title: z.string(),
  thumbnail_url: z.string().optional().nullable(),
  tier_id: z.string().optional().nullable(),
  position: z.number().default(0),
  notes: z.string().optional().nullable(),
});

const createSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional().nullable(),
  type: z.enum(['slides', 'tier_list', 'social_audit']).default('slides'),
  audit_data: z.record(z.string(), z.unknown()).optional(),
  client_id: z.string().uuid().optional().nullable(),
  slides: z.array(slideSchema).optional(),
  tiers: z.array(tierDefSchema).optional(),
  tier_items: z.array(tierItemSchema).optional(),
  status: z.enum(['draft', 'ready', 'archived']).optional(),
  tags: z.array(z.string()).optional(),
});

export async function GET() {
  try {
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

    const { data, error } = await adminClient
      .from('presentations')
      .select('*, clients(name)')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching presentations:', error);
      return NextResponse.json({ error: 'Failed to fetch presentations' }, { status: 500 });
    }

    const result = (data ?? []).map((p: Record<string, unknown>) => ({
      ...p,
      client_name: (p.clients as { name: string } | null)?.name ?? null,
      clients: undefined,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/presentations error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
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
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await adminClient
      .from('presentations')
      .insert({
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        type: parsed.data.type,
        client_id: parsed.data.client_id ?? null,
        created_by: user.id,
        slides: parsed.data.slides ?? [],
        tiers: parsed.data.tiers ?? [],
        tier_items: parsed.data.tier_items ?? [],
        status: parsed.data.status ?? 'draft',
        tags: parsed.data.tags ?? [],
        audit_data: parsed.data.audit_data ?? {},
      })
      .select('*, clients(name)')
      .single();

    if (error) {
      console.error('Error creating presentation:', error);
      return NextResponse.json({ error: 'Failed to create presentation' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('POST /api/presentations error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
