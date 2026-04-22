import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const GROUP_COLOR_KEYS = [
  'cyan',
  'purple',
  'coral',
  'emerald',
  'amber',
  'rose',
  'teal',
  'slate',
] as const;

const PatchBody = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.enum(GROUP_COLOR_KEYS).optional(),
  sort_order: z.number().int().min(0).optional(),
}).refine(
  (b) => b.name !== undefined || b.color !== undefined || b.sort_order !== undefined,
  { message: 'At least one field (name, color, sort_order) required' },
);

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { admin };
}

/**
 * PATCH /api/client-groups/[id]
 * Rename, recolor, or reorder a group.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const gate = await requireAdmin();
    if (gate.error) return gate.error;
    const { admin } = gate;

    const parsed = PatchBody.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('client_groups')
      .update(parsed.data)
      .eq('id', id)
      .select('id, name, color, sort_order, created_at, updated_at')
      .single();

    if (error) {
      console.error('PATCH /api/client-groups/[id] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ group: data });
  } catch (error) {
    console.error('PATCH /api/client-groups/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/client-groups/[id]
 * Delete a group. ON DELETE SET NULL on clients.group_id means members
 * fall back to the "Unassigned" bucket automatically.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const gate = await requireAdmin();
    if (gate.error) return gate.error;
    const { admin } = gate;

    const { error } = await admin.from('client_groups').delete().eq('id', id);
    if (error) {
      console.error('DELETE /api/client-groups/[id] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/client-groups/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
