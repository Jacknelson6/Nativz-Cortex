import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertUserCanAccessClient } from '@/lib/api/client-access';

const createPillarSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  emoji: z.string().optional(),
  example_series: z.array(z.string()).optional(),
  formats: z.array(z.string()).optional(),
  hooks: z.array(z.string()).optional(),
  frequency: z.string().optional(),
});

/**
 * GET /api/clients/[id]/pillars
 *
 * List all content pillars for a client, ordered by sort_order ascending.
 *
 * @auth Required (any authenticated user)
 * @param id - Client UUID
 * @returns {{ pillars: ContentPillar[] }}
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const access = await assertUserCanAccessClient(admin, user.id, id);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

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

/**
 * POST /api/clients/[id]/pillars
 *
 * Create a new content pillar for a client. The sort_order is automatically set to
 * append at the end of the existing pillars list.
 *
 * @auth Required (any authenticated user)
 * @param id - Client UUID
 * @body name - Pillar name (required)
 * @body description - Pillar description
 * @body emoji - Emoji icon for the pillar
 * @body example_series - Array of example series/show names
 * @body formats - Array of video format strings
 * @body hooks - Array of hook/angle strings
 * @body frequency - Posting frequency suggestion
 * @returns {{ pillar: ContentPillar }} Created pillar record
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const adminClient = createAdminClient();
  const accessCheck = await assertUserCanAccessClient(adminClient, user.id, id);
  if (!accessCheck.allowed) {
    return NextResponse.json({ error: accessCheck.error }, { status: accessCheck.status });
  }

  const body = await req.json();
  const parsed = createPillarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  // Get max sort_order for this client
  const { data: maxRow } = await adminClient
    .from('content_pillars')
    .select('sort_order')
    .eq('client_id', id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data: pillar, error } = await adminClient
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
