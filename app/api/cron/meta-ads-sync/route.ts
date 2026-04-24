import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncMetaAdSpendForClient } from '@/lib/meta-ads/spend-sync';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: clients } = await admin
    .from('clients')
    .select('id, name')
    .not('meta_ad_account_id', 'is', null);

  const results: Array<{ client_id: string; ok: boolean; detail?: string }> = [];
  for (const c of clients ?? []) {
    try {
      const r = await syncMetaAdSpendForClient(c.id, admin);
      results.push({
        client_id: c.id,
        ok: r.ok,
        detail: r.ok ? `${r.rows} rows, ${r.months} months` : r.error,
      });
    } catch (err) {
      results.push({
        client_id: c.id,
        ok: false,
        detail: err instanceof Error ? err.message : 'unknown error',
      });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  return NextResponse.json({ ok: true, synced: ok, failed, results });
}
