/**
 * GET /api/clients/[clientId]/capacity
 *
 * Returns per-service monthly deliverable capacity for a client (editing /
 * smm / blogging) along with the source of each number ("proposal" if a
 * signed proposal tier defines it, "default" if we fell back to
 * lib/clients/service-defaults.ts, "not-subscribed" if the client doesn't
 * carry the service at all). Used by ServiceCapacityPanel and
 * DeliverableProgress.
 *
 * Auth model mirrors /api/deliverables/[clientId]/pipeline:
 *   - admins can request any client
 *   - portal viewers can request only clients in their user_client_access
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/permissions';
import { getClientServiceCapacity } from '@/lib/clients/get-service-capacity';

const ParamsSchema = z.object({
  clientId: z.string().uuid(),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ clientId: string }> },
) {
  const parsed = ParamsSchema.safeParse(await ctx.params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid client id' }, { status: 400 });
  }
  const { clientId } = parsed.data;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const userIsAdmin = await isAdmin(user.id);

  if (!userIsAdmin) {
    const { data: access } = await admin
      .from('user_client_access')
      .select('client_id')
      .eq('user_id', user.id)
      .eq('client_id', clientId)
      .maybeSingle();
    if (!access) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const capacity = await getClientServiceCapacity(admin, clientId);
  return NextResponse.json(capacity);
}
