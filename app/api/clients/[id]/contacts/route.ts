import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const createContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  role: z.string().max(100).optional().nullable(),
  is_primary: z.boolean().optional().default(false),
});

const updateContactSchema = z.object({
  contact_id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  role: z.string().max(100).optional().nullable(),
  is_primary: z.boolean().optional(),
});

const deleteContactSchema = z.object({
  contact_id: z.string().uuid(),
});

async function requireAdmin(request: NextRequest) {
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;
    const user = await requireAdmin(_request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('client_contacts')
      .select('*')
      .eq('client_id', clientId)
      .order('is_primary', { ascending: false })
      .order('name');

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('GET /api/clients/[id]/contacts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;
    const user = await requireAdmin(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = createContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // If setting as primary, unset existing primary first
    if (parsed.data.is_primary) {
      await adminClient
        .from('client_contacts')
        .update({ is_primary: false })
        .eq('client_id', clientId)
        .eq('is_primary', true);
    }

    const { data, error } = await adminClient
      .from('client_contacts')
      .insert({ client_id: clientId, ...parsed.data })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('POST /api/clients/[id]/contacts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;
    const user = await requireAdmin(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = updateContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { contact_id, ...updates } = parsed.data;
    const adminClient = createAdminClient();

    // If setting as primary, unset existing primary first
    if (updates.is_primary) {
      await adminClient
        .from('client_contacts')
        .update({ is_primary: false })
        .eq('client_id', clientId)
        .eq('is_primary', true);
    }

    const { data, error } = await adminClient
      .from('client_contacts')
      .update(updates)
      .eq('id', contact_id)
      .eq('client_id', clientId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('PATCH /api/clients/[id]/contacts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;
    const user = await requireAdmin(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = deleteContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from('client_contacts')
      .delete()
      .eq('id', parsed.data.contact_id)
      .eq('client_id', clientId);

    if (error) {
      return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/clients/[id]/contacts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
