import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

const UpdateSchema = z.object({
  email: z.string().email().optional(),
  full_name: z.string().optional().nullable(),
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  subscribed: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    patch[k] = k === 'email' && typeof v === 'string' ? v.toLowerCase().trim() : v;
  }
  if (parsed.data.subscribed === false) {
    patch.unsubscribed_at = new Date().toISOString();
  }
  if (parsed.data.subscribed === true) {
    patch.unsubscribed_at = null;
  }

  const { data, error } = await admin
    .from('email_contacts')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    console.warn('[email-hub/contacts] update failed:', error);
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
  }
  return NextResponse.json({ contact: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from('email_contacts').delete().eq('id', id);
  if (error) {
    console.warn('[email-hub/contacts] delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
