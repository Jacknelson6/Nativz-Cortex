import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveAccessContext } from '@/lib/portal/effective-access';

const querySchema = z.object({
  clientId: z.string().uuid().optional(),
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
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const { clientId } = parsed.data;
  const admin = createAdminClient();

  // Tenant isolation — viewers + impersonating admins must match the
  // requested client against their effective clientIds. A mismatch
  // returns 404 (not 403) so we don't confirm the client exists elsewhere.
  const ctx = await getEffectiveAccessContext(user, admin);
  if (clientId && ctx.role === 'viewer') {
    if (!ctx.clientIds || !ctx.clientIds.includes(clientId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  let query = admin
    .from('topic_searches')
    .select('id, query, status, created_at, completed_at, search_mode, platforms, volume, metrics, client_id, clients(name)')
    .in('status', ['completed', 'processing', 'pending'])
    .order('created_at', { ascending: false })
    .limit(30);

  if (clientId) {
    query = query.eq('client_id', clientId);
  } else if (ctx.role === 'viewer') {
    // Cross-client load for a viewer — limit to brands they can see.
    if (!ctx.clientIds || ctx.clientIds.length === 0) {
      return NextResponse.json({ searches: [] });
    }
    query = query.in('client_id', ctx.clientIds);
  }
  // Admins without a clientId get every brand's recent searches.

  const { data: searches } = await query;

  return NextResponse.json({ searches: searches ?? [] });
}
