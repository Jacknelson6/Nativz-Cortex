import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ impersonating: false });
  }

  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-impersonate-org')?.value;
  const slug = cookieStore.get('x-impersonate-slug')?.value;

  if (!orgId) {
    return NextResponse.json({ impersonating: false });
  }

  // Get client name for display
  const adminClient = createAdminClient();
  const { data: client } = await adminClient
    .from('clients')
    .select('name')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .limit(1)
    .single();

  return NextResponse.json({
    impersonating: true,
    client_name: client?.name ?? 'Unknown client',
    client_slug: slug ?? '',
  });
}
