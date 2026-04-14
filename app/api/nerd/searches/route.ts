import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const querySchema = z.object({
  clientId: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
  }

  const { clientId } = parsed.data;
  const admin = createAdminClient();

  // Tenant isolation: viewers may only list searches for a client in
  // their own organization. Any mismatch returns 404 (not 403) so the
  // response shape doesn't confirm the client exists in another org.
  const { data: userData } = await admin
    .from('users')
    .select('role, organization_id')
    .eq('id', user.id)
    .single();

  if (userData?.role === 'viewer') {
    const { data: client } = await admin
      .from('clients')
      .select('organization_id')
      .eq('id', clientId)
      .maybeSingle();
    if (!client || client.organization_id !== userData.organization_id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  const { data: searches } = await admin
    .from('topic_searches')
    .select('id, query, status, created_at, completed_at, search_mode, platforms, volume, metrics')
    .eq('client_id', clientId)
    .in('status', ['completed', 'processing', 'pending'])
    .order('created_at', { ascending: false })
    .limit(30);

  return NextResponse.json({ searches: searches ?? [] });
}
