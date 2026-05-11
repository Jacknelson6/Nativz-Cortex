// VFF-02: nightly cron — recompute brand_format_context for every
// active, non-paused client.
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeBrandFormatContext } from '@/lib/analytics/brand-format-context';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const admin = createAdminClient();

  const { data: clients, error } = await admin
    .from('clients')
    .select('id, is_paused, is_active')
    .or('is_paused.is.null,is_paused.eq.false')
    .or('is_active.is.null,is_active.eq.true');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (clients ?? []) as Array<{
    id: string;
    is_paused: boolean | null;
    is_active: boolean | null;
  }>;
  const targets = rows.filter(
    (r) => r.is_paused !== true && r.is_active !== false,
  );

  let succeeded = 0;
  const errors: Array<{ client_id: string; message: string }> = [];
  for (const row of targets) {
    try {
      const ctx = await computeBrandFormatContext(row.id);
      if (ctx) succeeded += 1;
      else errors.push({ client_id: row.id, message: 'compute returned null' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      errors.push({ client_id: row.id, message: msg });
    }
  }

  return NextResponse.json({
    processed: targets.length,
    succeeded,
    failed: targets.length - succeeded,
    duration_ms: Date.now() - start,
    errors,
  });
}
