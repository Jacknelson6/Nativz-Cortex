import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

const AddSchema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1),
});

const RemoveSchema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = AddSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const rows = parsed.data.contact_ids.map((contact_id) => ({ list_id: id, contact_id }));
  const admin = createAdminClient();
  const { error } = await admin.from('email_list_members').upsert(rows, { onConflict: 'list_id,contact_id' });
  if (error) {
    console.warn('[email-hub/lists/members] add failed:', error);
    return NextResponse.json({ error: 'Failed to add members' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, added: rows.length });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = RemoveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('email_list_members')
    .delete()
    .eq('list_id', id)
    .in('contact_id', parsed.data.contact_ids);
  if (error) {
    console.warn('[email-hub/lists/members] remove failed:', error);
    return NextResponse.json({ error: 'Failed to remove members' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, removed: parsed.data.contact_ids.length });
}
