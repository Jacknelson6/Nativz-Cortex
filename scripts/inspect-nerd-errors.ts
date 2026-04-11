/**
 * One-off: inspect /api/nerd/chat errors + current nerd_model override.
 * Run: npx tsx scripts/inspect-nerd-errors.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Minimal .env.local loader — avoids dotenv dependency
try {
  const envPath = resolve(process.cwd(), '.env.local');
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const [, k, vRaw] = m;
    if (process.env[k]) continue;
    const v = vRaw.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    process.env[k] = v;
  }
} catch {
  /* ignore */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  console.log('=== request_meta distribution across most recent 20 ===');
  const { data: recent20 } = await supabase
    .from('api_error_log')
    .select('created_at, status_code, error_message, error_detail, request_meta')
    .eq('route', '/api/nerd/chat')
    .order('created_at', { ascending: false })
    .limit(20);
  for (const r of recent20 ?? []) {
    const detail = (r.error_detail ?? '').toString();
    const shortErr = detail.match(/"message": "([^"]+)/)?.[1]?.slice(0, 120) ?? 'n/a';
    console.log(`  ${r.created_at}  ${r.status_code}  ${JSON.stringify(r.request_meta)}  ${shortErr}`);
  }

  console.log('\n=== api_error_log — full column discovery ===');
  const { data: oneRow } = await supabase
    .from('api_error_log')
    .select('*')
    .eq('route', '/api/nerd/chat')
    .order('created_at', { ascending: false })
    .limit(1);
  if (oneRow?.[0]) {
    console.log('columns:', Object.keys(oneRow[0]));
  }

  console.log('\n=== api_error_log — /api/nerd/chat (last 5, full rows) ===');
  const { data: errors } = await supabase
    .from('api_error_log')
    .select('*')
    .eq('route', '/api/nerd/chat')
    .order('created_at', { ascending: false })
    .limit(5);
  for (const r of errors ?? []) {
    console.log('---');
    for (const [k, v] of Object.entries(r)) {
      const val = typeof v === 'string' && v.length > 600 ? v.slice(0, 600) + '…' : v;
      console.log(`  ${k}:`, val);
    }
  }

  console.log('\n=== try agency_settings / ai_model tables ===');
  for (const table of ['agency_settings', 'llm_provider_keys', 'ai_models', 'ai_feature_routing']) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) console.log(`  ${table}: ${error.message}`);
    else if (data && data[0]) console.log(`  ${table}: columns =`, Object.keys(data[0]));
    else console.log(`  ${table}: (empty)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
