import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/editing/monthly-summary?month=YYYY-MM-01
 *
 * Returns per-client breakdowns of monthly_deliverable_slots for one month
 * so the content-tools board can render target-vs-actual pills like
 * "4 / 6 reels delivered". One row per (client, deliverable_type) with the
 * delivered + total counts and the type label resolved from
 * deliverable_types so the UI doesn't re-join.
 *
 * Defaults to the current UTC month if `month` is omitted. The month param
 * must be a YYYY-MM-01 string (the same shape the cron writes); other
 * day-of-month values are rejected so the UI can't ask for a slice that
 * could never exist.
 */

const QuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}-01$/u, 'month must be YYYY-MM-01')
    .optional(),
});

type SlotRow = {
  client_id: string;
  deliverable_type_id: string;
  status: 'pending' | 'in_progress' | 'delivered' | 'skipped';
  clients: { id: string; name: string; logo_url: string | null } | null;
  deliverable_types: { id: string; slug: string; label_plural: string } | null;
};

type ClientBucket = {
  client_id: string;
  client_name: string;
  client_logo_url: string | null;
  by_type: Record<string, TypeCounts>;
};

type TypeCounts = {
  type_id: string;
  slug: string;
  label_plural: string;
  total: number;
  delivered: number;
  in_progress: number;
  pending: number;
  skipped: number;
};

function firstOfThisMonthUTC(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    month: url.searchParams.get('month') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', detail: parsed.error.message },
      { status: 400 },
    );
  }
  const month = parsed.data.month ?? firstOfThisMonthUTC();

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from('monthly_deliverable_slots')
    .select(
      'client_id, deliverable_type_id, status, clients(id, name, logo_url), deliverable_types(id, slug, label_plural)',
    )
    .eq('month_start', month)
    .returns<SlotRow[]>();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byClient = new Map<string, ClientBucket>();
  for (const row of rows ?? []) {
    if (!row.clients || !row.deliverable_types) continue;
    const bucket =
      byClient.get(row.client_id) ??
      ({
        client_id: row.client_id,
        client_name: row.clients.name,
        client_logo_url: row.clients.logo_url,
        by_type: {},
      } satisfies ClientBucket);
    const typeKey = row.deliverable_types.slug;
    const counts: TypeCounts =
      bucket.by_type[typeKey] ??
      ({
        type_id: row.deliverable_types.id,
        slug: row.deliverable_types.slug,
        label_plural: row.deliverable_types.label_plural,
        total: 0,
        delivered: 0,
        in_progress: 0,
        pending: 0,
        skipped: 0,
      } satisfies TypeCounts);
    counts.total += 1;
    counts[row.status] += 1;
    bucket.by_type[typeKey] = counts;
    byClient.set(row.client_id, bucket);
  }

  const clients = Array.from(byClient.values()).sort((a, b) =>
    a.client_name.localeCompare(b.client_name),
  );

  return NextResponse.json({ month, clients });
}
