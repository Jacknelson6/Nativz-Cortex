import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

const CategoryEnum = z.enum(['followup', 'reminder', 'calendar', 'welcome', 'general']);

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  category: CategoryEnum.optional(),
  subject: z.string().max(200).optional(),
  body_markdown: z.string().max(10000).optional(),
});

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
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('email_templates')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, category, subject, body_markdown, updated_at, created_by')
    .single();

  if (error || !data) {
    console.warn('[email-templates] update failed:', error);
    return NextResponse.json({ error: 'Template not found or update failed' }, { status: 404 });
  }
  return NextResponse.json({ template: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from('email_templates').delete().eq('id', id);
  if (error) {
    console.warn('[email-templates] delete failed:', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
