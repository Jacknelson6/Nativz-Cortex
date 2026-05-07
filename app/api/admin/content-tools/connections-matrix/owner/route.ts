import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/content-tools/connections-matrix/owner
 *
 * Sets `account_owner` on every social_profiles row for a given
 * (clientId, platform) pair. Used by the Connections matrix
 * cell-popover to mark whether Nativz or the client created the
 * underlying social account. Drives reconnect-notification routing in
 * the connection-expired-watch cron: agency-owned rows do not generate
 * any client-facing communication, the team handles internally.
 *
 * Auth: admin-only.
 */

const OWNER_VALUES = ['agency', 'client', 'unknown'] as const;

const Body = z.object({
  clientId: z.string().uuid(),
  platform: z.string().min(1),
  accountOwner: z.enum(OWNER_VALUES),
});

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error, count } = await admin
    .from('social_profiles')
    .update({ account_owner: parsed.accountOwner }, { count: 'exact' })
    .eq('client_id', parsed.clientId)
    .eq('platform', parsed.platform);

  if (error) {
    return NextResponse.json(
      { error: 'db_error', detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, updated: count ?? 0 });
}
