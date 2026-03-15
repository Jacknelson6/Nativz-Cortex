import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const updatePillarSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  emoji: z.string().optional(),
  example_series: z.array(z.string()).optional(),
  formats: z.array(z.string()).optional(),
  hooks: z.array(z.string()).optional(),
  frequency: z.string().optional(),
  sort_order: z.number().int().min(0).optional(),
});

/**
 * PATCH /api/clients/[id]/pillars/[pillarId]
 *
 * Update a content pillar's details. Any combination of fields may be provided.
 *
 * @auth Required (any authenticated user)
 * @param id - Client UUID
 * @param pillarId - Content pillar UUID
 * @body name - Optional pillar name
 * @body description - Optional description
 * @body emoji - Optional single emoji
 * @body example_series - Optional array of recurring series names
 * @body formats - Optional array of content format strings
 * @body hooks - Optional array of opening-line hooks
 * @body frequency - Optional posting frequency description
 * @body sort_order - Optional integer sort order
 * @returns {{ pillar: ContentPillar }}
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; pillarId: string }> }
) {
  const { id, pillarId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = updatePillarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: pillar, error } = await admin
    .from('content_pillars')
    .update(parsed.data)
    .eq('id', pillarId)
    .eq('client_id', id)
    .select()
    .single();

  if (error) {
    console.error('Failed to update pillar:', error);
    return NextResponse.json({ error: 'Failed to update pillar' }, { status: 500 });
  }

  return NextResponse.json({ pillar });
}

/**
 * DELETE /api/clients/[id]/pillars/[pillarId]
 *
 * Permanently delete a content pillar for a client.
 *
 * @auth Required (any authenticated user)
 * @param id - Client UUID
 * @param pillarId - Content pillar UUID to delete
 * @returns {{ success: true }}
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; pillarId: string }> }
) {
  const { id, pillarId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { error } = await admin
    .from('content_pillars')
    .delete()
    .eq('id', pillarId)
    .eq('client_id', id);

  if (error) {
    console.error('Failed to delete pillar:', error);
    return NextResponse.json({ error: 'Failed to delete pillar' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
