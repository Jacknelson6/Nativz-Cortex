/**
 * Send the weekly affiliate report email using live data from Supabase (UpPromote sync).
 *
 * Usage:
 *   npx tsx scripts/send-weekly-affiliate-report-test.ts [--client-id <uuid>] [--to <email>]
 *
 * Reads `.env.local` for NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY.
 * Optional: AFFILIATE_WEEKLY_REPORT_CLIENT_ID when --client-id is omitted.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAffiliateAnalyticsRange } from '@/lib/affiliates/fetch-affiliate-analytics-range';
import { syncClientAffiliates } from '@/lib/uppromote/sync';

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  });
  Object.entries(env).forEach(([k, v]) => {
    process.env[k] = v;
  });
}

function rollingSevenDayRangeUtc(): { start: string; end: string; label: string } {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 6);
  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);
  return { start, end, label: `${start} → ${end} (UTC)` };
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let clientId: string | undefined;
  let to = 'jack@nativz.io';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client-id' && argv[i + 1]) {
      clientId = argv[++i];
    } else if (argv[i] === '--to' && argv[i + 1]) {
      to = argv[++i];
    }
  }
  return { clientId, to };
}

async function resolveClientId(
  admin: ReturnType<typeof createAdminClient>,
  explicit?: string,
): Promise<{ id: string; name: string }> {
  if (explicit) {
    const { data, error } = await admin.from('clients').select('id, name').eq('id', explicit).single();
    if (error || !data) throw new Error(`Client not found for id ${explicit}`);
    return { id: data.id, name: data.name };
  }

  const fromEnv = process.env.AFFILIATE_WEEKLY_REPORT_CLIENT_ID?.trim();
  if (fromEnv) {
    const { data, error } = await admin.from('clients').select('id, name').eq('id', fromEnv).single();
    if (error || !data) throw new Error(`Client not found for AFFILIATE_WEEKLY_REPORT_CLIENT_ID`);
    return { id: data.id, name: data.name };
  }

  const { data: row, error } = await admin
    .from('affiliate_members')
    .select('client_id')
    .limit(1)
    .maybeSingle();

  if (error || !row?.client_id) {
    throw new Error(
      'No affiliate_members rows found. Pass --client-id, set AFFILIATE_WEEKLY_REPORT_CLIENT_ID, or run UpPromote sync.',
    );
  }

  const { data: client, error: cErr } = await admin
    .from('clients')
    .select('id, name')
    .eq('id', row.client_id)
    .single();

  if (cErr || !client) throw new Error('Could not load client for affiliate_members row');
  return { id: client.id, name: client.name };
}

async function main() {
  loadEnvLocal();
  const { sendAffiliateWeeklyReportEmail } = await import('@/lib/email/resend');
  const { clientId: argClientId, to } = parseArgs();

  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY missing in .env.local');
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local');
  }

  const admin = createAdminClient();
  const { id: clientId, name: clientName } = await resolveClientId(admin, argClientId);
  const { start, end, label } = rollingSevenDayRangeUtc();

  console.log(`Client: ${clientName} (${clientId})`);
  console.log(`Range: ${label}`);

  const { data: keyRow } = await admin
    .from('clients')
    .select('uppromote_api_key')
    .eq('id', clientId)
    .single();
  if (keyRow?.uppromote_api_key) {
    console.log('Syncing UpPromote…');
    await syncClientAffiliates(clientId, keyRow.uppromote_api_key);
  } else {
    console.warn('No UpPromote API key on client — skipping sync');
  }

  const analytics = await fetchAffiliateAnalyticsRange(admin, clientId, start, end);

  const sendResult = await sendAffiliateWeeklyReportEmail({
    to: [to],
    clientName,
    rangeLabel: label,
    kpis: analytics.kpis,
    topAffiliates: analytics.topAffiliates.map((a) => ({
      name: a.name,
      revenue: a.revenue,
      referrals: a.referrals,
    })),
    isTestOverride: true,
  });

  if (sendResult.error) {
    console.error(sendResult.error);
    process.exit(1);
  }

  console.log('Sent:', sendResult.data?.id, '→', to);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
