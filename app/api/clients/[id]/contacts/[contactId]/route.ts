import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const updateContactSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  role: z.string().max(100).optional().nullable(),
  project_role: z.string().max(100).optional().nullable(),
  avatar_url: z.string().url().optional().nullable(),
  is_primary: z.boolean().optional(),
});

async function requireAdmin() {
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
  return user;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const { id: clientId, contactId } = await params;
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = updateContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // If setting as primary, unset existing primary first
    if (updates.is_primary) {
      await adminClient
        .from('contacts')
        .update({ is_primary: false })
        .eq('client_id', clientId)
        .eq('is_primary', true);
    }

    const { data, error } = await adminClient
      .from('contacts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', contactId)
      .eq('client_id', clientId)
      .select()
      .single();

    if (error) {
      console.error('Error updating contact:', error);
      return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('PATCH /api/clients/[id]/contacts/[contactId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const { id: clientId, contactId } = await params;
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from('contacts')
      .delete()
      .eq('id', contactId)
      .eq('client_id', clientId);

    if (error) {
      console.error('Error deleting contact:', error);
      return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/clients/[id]/contacts/[contactId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
