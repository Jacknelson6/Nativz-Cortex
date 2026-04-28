/**
 * Monday-driven content calendar orchestrator.
 *
 * Reads board 9232769015 group "April 2026", finds every row whose
 * "Editing Status" is "EM Approved", runs the full pipeline against the
 * "Edited Videos Folder" link, mints a share link in draft mode, and writes
 * the share link + Status = "Scheduled" back to Monday.
 *
 * Run:
 *   npx tsx scripts/queue-from-monday.ts                  # dry-run plan
 *   npx tsx scripts/queue-from-monday.ts --apply          # full pipeline + Monday writeback
 *   npx tsx scripts/queue-from-monday.ts --apply --only=skibell-fine-jewelry  # one client only
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';
import { listVideosInFolder } from '@/lib/calendar/drive-folder';
import { runCalendarPipeline, eachDay, pickEven } from '@/lib/calendar/run-pipeline';
import {
  fetchAprilRows,
  getMondayToken,
  setLaterCalendarLink,
  setStatusScheduled,
  STATUS_EM_APPROVED,
  type MondayRow,
} from '@/lib/monday/calendars-board';
import type { SocialPlatform } from '@/lib/posting';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import { getBrandFromAgency } from '@/lib/agency/detect';

const USER_EMAIL = (process.env.QUEUE_USER_EMAIL ?? 'jack@nativz.io').toLowerCase();

const MONTH_START = '2026-05-01';
const MONTH_END = '2026-05-31';
const POST_TIME_CT = '12:00';

// Monday item name → Cortex client slug. Generated against the board on
// 2026-04-27 and against active clients with SMM service. Names that don't
// match a Cortex client are flagged at runtime, never silently skipped.
const NAME_TO_SLUG: Record<string, string> = {
  'Coast to Coast': 'coast-to-coast',
  'Owings Auto': 'owings-auto',
  'Equidad Homes': 'equidad-homes',
  'Rana Furniture': 'rana-furniture',
  'All Shutters and Blinds': 'all-shutters-and-blinds',
  'Avondale Private Lending': 'avondale-private-lending',
  'Crystal Creek Cattle': 'crystal-creek-cattle',
  'Custom Shade and Shutter': 'custom-shade-and-shutter',
  'Goodier Labs': 'goodier-labs',
  "Dunston's Steakhouse": 'dunstons-steakhouse',
  'Fusion Brands': 'fusion-brands',
  'Hartley Law': 'hartley-law',
  'Skibell Fine Jewelry': 'skibell-fine-jewelry',
  'The Standard Ranch Water': 'the-standard-ranch-water',
  'Total Plumbing': 'total-plumbing',
  'Varsity Vault': 'varsity-vault',
  'Goldback': 'goldback',
  'Safe Stop': 'safe-stop',
  'National Lenders': 'national-lenders',
  'Rank Prompt': 'rank-prompt',
};

interface ClientPlan {
  row: MondayRow;
  slug: string;
  clientId: string;
  clientName: string;
  agency: string | null;
  platforms: SocialPlatform[];
  videoCount: number;
  skipReason?: string;
}

async function buildPlan(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  rows: MondayRow[],
  onlyFilter: string | null,
): Promise<ClientPlan[]> {
  const plans: ClientPlan[] = [];
  for (const row of rows) {
    const slug = NAME_TO_SLUG[row.name];
    if (!slug) {
      plans.push({ row, slug: '', clientId: '', clientName: row.name, agency: null, platforms: [], videoCount: 0, skipReason: `no Cortex slug mapping for "${row.name}"` });
      continue;
    }
    if (onlyFilter && slug !== onlyFilter) continue;

    if (!row.folderUrl) {
      plans.push({ row, slug, clientId: '', clientName: row.name, agency: null, platforms: [], videoCount: 0, skipReason: 'Edited Videos Folder column empty' });
      continue;
    }

    const { data: client } = await admin
      .from('clients')
      .select('id, name, agency, services, is_active')
      .eq('slug', slug)
      .maybeSingle<{ id: string; name: string; agency: string | null; services: string[] | null; is_active: boolean | null }>();
    if (!client) {
      plans.push({ row, slug, clientId: '', clientName: row.name, agency: null, platforms: [], videoCount: 0, skipReason: `Cortex client not found for slug ${slug}` });
      continue;
    }
    if (!client.is_active) {
      plans.push({ row, slug, clientId: client.id, clientName: client.name, agency: client.agency, platforms: [], videoCount: 0, skipReason: 'Cortex client inactive' });
      continue;
    }

    const { data: profiles } = await admin
      .from('social_profiles')
      .select('platform, late_account_id')
      .eq('client_id', client.id)
      .eq('is_active', true);
    const platforms = (profiles ?? [])
      .filter((p) => typeof p.late_account_id === 'string' && p.late_account_id.length > 0)
      .map((p) => p.platform as SocialPlatform);

    if (platforms.length === 0) {
      plans.push({ row, slug, clientId: client.id, clientName: client.name, agency: client.agency, platforms: [], videoCount: 0, skipReason: 'no Zernio-connected social profiles' });
      continue;
    }

    let videoCount = 0;
    try {
      const { videos } = await listVideosInFolder(userId, row.folderUrl);
      videoCount = videos.filter((v) => v.size > 0).length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      plans.push({ row, slug, clientId: client.id, clientName: client.name, agency: client.agency, platforms, videoCount: 0, skipReason: `Drive list failed: ${msg}` });
      continue;
    }

    if (videoCount === 0) {
      plans.push({ row, slug, clientId: client.id, clientName: client.name, agency: client.agency, platforms, videoCount: 0, skipReason: 'folder has 0 videos' });
      continue;
    }

    plans.push({ row, slug, clientId: client.id, clientName: client.name, agency: client.agency, platforms, videoCount });
  }
  return plans;
}

async function runOne(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  userEmail: string,
  plan: ClientPlan,
): Promise<{ ok: boolean; shareUrl?: string; error?: string }> {
  const { videos } = await listVideosInFolder(userId, plan.row.folderUrl!);
  const usable = videos.filter((v) => v.size > 0).sort((a, b) => a.name.localeCompare(b.name));
  const dates = pickEven(eachDay(MONTH_START, MONTH_END), usable.length);

  const brand = getBrandFromAgency(plan.agency);
  const appUrl = getCortexAppUrl(brand);
  console.log(`  brand=${brand}  appUrl=${appUrl}`);

  const result = await runCalendarPipeline(admin, {
    label: `${plan.clientName} (May 2026 calendar)`,
    folderUrl: plan.row.folderUrl!,
    videos: usable,
    perVideoDates: dates,
    defaultPostTimeCt: POST_TIME_CT,
    startDate: MONTH_START,
    endDate: MONTH_END,
    platforms: plan.platforms,
    mintShareLink: true,
    draftMode: true,
    appUrl,
    clientId: plan.clientId,
    userId,
    userEmail,
  });

  if (result.error) return { ok: false, error: result.error, shareUrl: result.shareUrl };
  if (!result.shareUrl) return { ok: false, error: 'pipeline finished but no share URL minted' };
  return { ok: true, shareUrl: result.shareUrl };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const onlyFilter = onlyArg ? onlyArg.slice('--only='.length) : null;

  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} — Monday-driven scheduler  ${MONTH_START} → ${MONTH_END}${onlyFilter ? '  (only=' + onlyFilter + ')' : ''}`);

  const admin = createAdminClient();
  const { data: userRow } = await admin
    .from('users')
    .select('id, email')
    .ilike('email', USER_EMAIL)
    .single<{ id: string; email: string }>();
  if (!userRow) throw new Error(`User not found: ${USER_EMAIL}`);
  console.log(`Running as ${userRow.email}\n`);

  const mondayToken = getMondayToken();

  console.log('── Fetch April 2026 rows from Monday ──');
  const rows = await fetchAprilRows(mondayToken);
  const emApproved = rows.filter((r) => r.status === STATUS_EM_APPROVED);
  console.log(`Found ${rows.length} rows, ${emApproved.length} with status=${STATUS_EM_APPROVED}`);

  console.log('\n── Build plan (validate clients, profiles, folder contents) ──');
  const plans = await buildPlan(admin, userRow.id, emApproved, onlyFilter);
  for (const p of plans) {
    if (p.skipReason) {
      console.log(`  ✗ ${p.row.name.padEnd(34)} SKIP — ${p.skipReason}`);
    } else {
      console.log(`  ✓ ${p.row.name.padEnd(34)} ${p.videoCount} videos → ${p.platforms.join(',')}`);
    }
  }
  const runnable = plans.filter((p) => !p.skipReason);
  console.log(`\nRunnable: ${runnable.length} / ${plans.length}`);

  if (!apply) {
    console.log('\n(dry-run — re-run with --apply to execute pipeline)');
    return;
  }

  if (runnable.length === 0) {
    console.log('\nNothing runnable — exiting.');
    return;
  }

  const summary: { name: string; ok: boolean; shareUrl?: string; error?: string }[] = [];

  for (const plan of runnable) {
    console.log(`\n══════════════════════════════════════════`);
    console.log(`▶ ${plan.clientName}  (${plan.videoCount} videos, ${plan.platforms.join(',')})`);
    console.log(`══════════════════════════════════════════`);
    try {
      const result = await runOne(admin, userRow.id, userRow.email, plan);
      summary.push({ name: plan.clientName, ok: result.ok, shareUrl: result.shareUrl, error: result.error });
      if (result.ok && result.shareUrl) {
        console.log(`  ✔ share: ${result.shareUrl}`);
        try {
          await setLaterCalendarLink(mondayToken, plan.row.id, result.shareUrl);
          await setStatusScheduled(mondayToken, plan.row.id);
          console.log('  ✔ Monday row updated → Scheduled + share link');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  ✗ Monday writeback failed: ${msg}`);
          summary[summary.length - 1].error = `pipeline ok, monday writeback failed: ${msg}`;
        }
      } else {
        console.error(`  ✗ pipeline failed: ${result.error ?? 'unknown'}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ crashed: ${msg}`);
      summary.push({ name: plan.clientName, ok: false, error: msg });
    }
  }

  console.log('\n══════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('══════════════════════════════════════════');
  for (const s of summary) {
    if (s.ok) console.log(`  ✔ ${s.name.padEnd(34)} ${s.shareUrl}`);
    else console.log(`  ✗ ${s.name.padEnd(34)} ${s.error ?? 'unknown error'}`);
  }
  for (const p of plans.filter((p) => p.skipReason)) {
    console.log(`  · ${p.row.name.padEnd(34)} skipped — ${p.skipReason}`);
  }

  const anyFailed = summary.some((s) => !s.ok);
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error('\n✗ Monday scheduler crashed:', err);
  process.exit(1);
});
