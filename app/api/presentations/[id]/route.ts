import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  slides: z.array(z.object({
    title: z.string().default(''),
    body: z.string().default(''),
    image_url: z.string().optional().nullable(),
    embed_url: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  })).optional(),
  tiers: z.array(z.object({
    id: z.string(),
    name: z.string(),
    color: z.string(),
  })).optional(),
  tier_items: z.array(z.object({
    id: z.string(),
    url: z.string().default(''),
    title: z.string(),
    thumbnail_url: z.string().optional().nullable(),
    tier_id: z.string().optional().nullable(),
    position: z.number().default(0),
    notes: z.string().optional().nullable(),
  })).optional(),
  status: z.enum(['draft', 'ready', 'archived']).optional(),
  tags: z.array(z.string()).optional(),
  audit_data: z.record(z.string(), z.unknown()).optional(),
});

async function checkAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const adminClient = createAdminClient();
  const { data: userData } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!userData || userData.role !== 'admin') return null;
  return { user, adminClient };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await checkAdmin();
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await auth.adminClient
      .from('presentations')
      .select('*, clients(name)')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Presentation not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...data,
      client_name: (data.clients as { name: string } | null)?.name ?? null,
      clients: undefined,
    });
  } catch (error) {
    console.error('GET /api/presentations/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await checkAdmin();
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await auth.adminClient
      .from('presentations')
      .update(parsed.data)
      .eq('id', id)
      .select('*, clients(name)')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Failed to update presentation' }, { status: 500 });
    }

    return NextResponse.json({
      ...data,
      client_name: (data.clients as { name: string } | null)?.name ?? null,
      clients: undefined,
    });
  } catch (error) {
    console.error('PUT /api/presentations/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await checkAdmin();
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { error } = await auth.adminClient
      .from('presentations')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: 'Failed to delete presentation' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/presentations/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
