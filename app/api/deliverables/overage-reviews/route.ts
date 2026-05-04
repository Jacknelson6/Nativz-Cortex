import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { getOverageDetails } from '@/lib/deliverables/get-overage-details';

/**
 * GET /api/deliverables/overage-reviews?client_id=...&service=editing&period_id=...
 *
 * Returns the (at most one) decision row for a (client, service, period). 200
 * with `{ review: null }` when no decision has been made yet so the caller can
 * branch cleanly without a 404 dance.
 *
 * POST same path with the same body shape + `decision` upserts the decision,
 * stamping `decided_by = current admin`. Two valid decisions: 'noted' (manual
 * handling) and 'top_up_opened' (admin clicked through to the credit pack).
 *
 * Both endpoints are admin-only (matches the table's RLS); the 401/403 dance
 * is identical to the rest of the accounting routes.
 */

const ServiceEnum = z.enum(['editing', 'smm', 'blogging']);
const DecisionEnum = z.enum(['noted', 'top_up_opened']);

const QuerySchema = z.object({
  client_id: z.string().uuid(),
  service: ServiceEnum,
  period_id: z.string().uuid(),
});

const BodySchema = QuerySchema.extend({
  decision: DecisionEnum,
  notes: z.string().max(2000).nullable().optional(),
});

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  if (!(await isAdmin(user.id))) return { error: 'Forbidden', status: 403 as const };
  return { user, admin: createAdminClient() };
}

export async function GET(request: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    client_id: url.searchParams.get('client_id'),
    service: url.searchParams.get('service'),
    period_id: url.searchParams.get('period_id'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }

  const { client_id, service, period_id } = parsed.data;

  const { data, error } = await ctx.admin
    .from('deliverable_overage_reviews')
    .select('id, client_id, service, period_id, decision, decided_by, decided_at, notes')
    .eq('client_id', client_id)
    .eq('service', service)
    .eq('period_id', period_id)
    .maybeSingle();

  if (error) {
    console.error('[overage-reviews] GET failed', error);
    return NextResponse.json({ error: 'Failed to load review' }, { status: 500 });
  }

  let rows: Awaited<ReturnType<typeof getOverageDetails>> = [];
  if (url.searchParams.get('include_details') === '1') {
    const { data: period } = await ctx.admin
      .from('payroll_periods')
      .select('start_date')
      .eq('id', period_id)
      .maybeSingle();
    const reference = period?.start_date ? new Date(period.start_date as string) : new Date();
    rows = await getOverageDetails(ctx.admin, client_id, service, reference);
  }

  return NextResponse.json({ review: data ?? null, rows });
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { client_id, service, period_id, decision, notes } = parsed.data;

  const { data, error } = await ctx.admin
    .from('deliverable_overage_reviews')
    .upsert(
      {
        client_id,
        service,
        period_id,
        decision,
        decided_by: ctx.user.id,
        decided_at: new Date().toISOString(),
        notes: notes ?? null,
      },
      { onConflict: 'client_id,service,period_id' },
    )
    .select('id, client_id, service, period_id, decision, decided_by, decided_at, notes')
    .single();

  if (error) {
    console.error('[overage-reviews] POST failed', error);
    return NextResponse.json({ error: 'Failed to record review' }, { status: 500 });
  }

  return NextResponse.json({ review: data });
}
