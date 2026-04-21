import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminClient();
  const { data: list, error } = await admin
    .from('email_lists')
    .select('id, name, description, tags, created_at, updated_at')
    .eq('id', id)
    .single();
  if (error || !list) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 });
  }

  const { data: members } = await admin
    .from('email_list_members')
    .select(`
      added_at,
      contact:contact_id ( id, email, full_name, title, company, subscribed )
    `)
    .eq('list_id', id)
    .order('added_at', { ascending: false });

  return NextResponse.json({ list, members: members ?? [] });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('email_lists')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) {
    console.warn('[email-hub/lists] update failed:', error);
    return NextResponse.json({ error: 'Failed to update list' }, { status: 500 });
  }
  return NextResponse.json({ list: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from('email_lists').delete().eq('id', id);
  if (error) {
    console.warn('[email-hub/lists] delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete list' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
