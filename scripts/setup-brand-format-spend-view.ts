/**
 * VFF-03 T03: create or replace the `brand_format_spend_daily` SQL view.
 * Idempotent; safe to re-run.
 *
 * Aligns with the actual `api_error_log` schema (columns: route, status_code,
 * request_meta jsonb, created_at). VFF-03 telemetry rows are written with
 * route='vff_sourcing' and request_meta carrying client_id, apify_cost_usd,
 * videos_inserted, videos_deduped.
 *
 * Usage: `npx tsx scripts/setup-brand-format-spend-view.ts`
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
 */

import { createClient } from '@supabase/supabase-js';

const VIEW_SQL = `
CREATE OR REPLACE VIEW brand_format_spend_daily AS
SELECT
  (request_meta ->> 'client_id')::uuid AS client_id,
  date_trunc('day', created_at)::date AS spend_date,
  SUM(COALESCE((request_meta ->> 'apify_cost_usd')::numeric, 0)) AS apify_cost_usd,
  SUM(COALESCE((request_meta ->> 'videos_inserted')::int, 0)) AS videos_inserted,
  SUM(COALESCE((request_meta ->> 'videos_deduped')::int, 0)) AS videos_deduped,
  COUNT(*) FILTER (WHERE status_code = 200) AS calls_succeeded,
  COUNT(*) FILTER (WHERE status_code >= 400) AS calls_failed
FROM api_error_log
WHERE route = 'vff_sourcing'
  AND created_at >= now() - interval '90 days'
  AND request_meta ->> 'client_id' IS NOT NULL
GROUP BY 1, 2;
`;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });

  // Supabase doesn't expose raw DDL via JS client; use the Postgres REST shim
  // via rpc('exec_sql', ...) if it exists, else surface manual instructions.
  // In this repo we rely on Supabase MCP / dashboard for view DDL; this script
  // prints the SQL the operator should execute via Supabase MCP execute_sql.
  console.log('Run this SQL via Supabase MCP execute_sql (or dashboard):');
  console.log('---');
  console.log(VIEW_SQL);
  console.log('---');

  // Attempt via a generic rpc fallback if available.
  try {
    const { error } = await (admin as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: Error | null }>;
    }).rpc('exec_sql', { sql: VIEW_SQL });
    if (!error) {
      console.log('view applied via rpc("exec_sql").');
      return;
    }
    console.warn('rpc("exec_sql") not available; SQL printed above for manual application.');
  } catch {
    // exec_sql rpc not configured; SQL above is the source of truth.
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
