/**
 * GET /api/deliverables/[clientId]/margin?period_start=&period_end=
 *
 * Per-editor margin breakdown for an admin period view. Admin-only: portal
 * viewers do not see internal cost data, so the route 403s for non-admins
 * regardless of their `user_client_access` row.
 *
 * Period defaults to the current calendar month when query params are
 * omitted. Both bounds are inclusive ISO timestamps; the loader filters
 * `credit_transactions.created_at` to the window.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/permissions';
import { getEditorMargin } from '@/lib/deliverables/get-margin';

function defaultPeriod(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const fallback = defaultPeriod();
  const periodStart = url.searchParams.get('period_start') ?? fallback.start;
  const periodEnd = url.searchParams.get('period_end') ?? fallback.end;

  const admin = createAdminClient();
  const snapshot = await getEditorMargin(admin, clientId, periodStart, periodEnd);
  return NextResponse.json(snapshot);
}
