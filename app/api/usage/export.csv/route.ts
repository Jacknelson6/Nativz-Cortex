import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/usage/export.csv
 *
 * Streams a CSV of every api_usage_logs row in the requested window so Jack
 * can save a copy locally (and hand it to Claude for analysis). Admin-only —
 * the full log contains user IDs + emails.
 *
 * @auth Admin / super-admin only
 * @query from  ISO timestamp; defaults to 30 days ago
 * @query to    ISO timestamp; defaults to now
 */
export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from =
    searchParams.get('from') ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const to = searchParams.get('to') ?? new Date().toISOString();

  const { data: rows } = await admin
    .from('api_usage_logs')
    .select(
      'created_at, service, model, feature, input_tokens, output_tokens, total_tokens, cost_usd, user_email, metadata',
    )
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: false })
    .limit(10_000);

  const header = [
    'created_at',
    'service',
    'model',
    'feature',
    'input_tokens',
    'output_tokens',
    'total_tokens',
    'cost_usd',
    'user_email',
    'metadata',
  ];

  const lines: string[] = [header.join(',')];
  for (const r of rows ?? []) {
    const row = r as Record<string, unknown>;
    lines.push(
      [
        csv(row.created_at),
        csv(row.service),
        csv(row.model),
        csv(row.feature),
        csv(row.input_tokens ?? 0),
        csv(row.output_tokens ?? 0),
        csv(row.total_tokens ?? 0),
        csv(row.cost_usd ?? 0),
        csv(row.user_email ?? ''),
        csv(row.metadata ? JSON.stringify(row.metadata) : ''),
      ].join(','),
    );
  }

  const csvBody = lines.join('\n');
  const filename = `cortex-usage-${from.slice(0, 10)}-to-${to.slice(0, 10)}.csv`;

  return new NextResponse(csvBody, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}

function csv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
