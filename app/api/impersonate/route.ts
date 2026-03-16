import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const impersonateSchema = z.object({
  organization_id: z.string().uuid(),
  client_slug: z.string().min(1),
});

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify user is an admin owner
  const adminClient = createAdminClient();
  const { data: userData } = await adminClient
    .from('users')
    .select('role, is_owner')
    .eq('id', user.id)
    .single();

  if (!userData || userData.role !== 'admin' || !userData.is_owner) {
    return NextResponse.json({ error: 'Only admin owners can impersonate clients' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = impersonateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { organization_id, client_slug } = parsed.data;

  // Verify the organization exists
  const { data: client } = await adminClient
    .from('clients')
    .select('id')
    .eq('organization_id', organization_id)
    .eq('slug', client_slug)
    .single();

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const cookieStore = await cookies();

  cookieStore.set('x-impersonate-org', organization_id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
  });

  cookieStore.set('x-impersonate-slug', client_slug, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
  });

  return NextResponse.json({ success: true, redirect: '/portal/dashboard' });
}

export async function DELETE() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.delete('x-impersonate-org');
  cookieStore.delete('x-impersonate-slug');

  return NextResponse.json({ success: true });
}
