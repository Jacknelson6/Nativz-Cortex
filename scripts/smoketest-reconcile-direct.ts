import { config } from 'dotenv';
config({ path: '.env.local' });
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';

const LOOKBACK_DAYS = 14;

async function main() {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error: queryErr } = await admin
    .from('scheduled_posts')
    .select('id, late_post_id, status, updated_at')
    .not('late_post_id', 'is', null)
    .gte('updated_at', cutoff)
    .in('status', ['scheduled', 'publishing', 'partially_failed', 'failed', 'published'])
    .limit(5);

  if (queryErr) {
    console.error('candidate query failed:', queryErr);
    process.exit(1);
  }

  console.log(`candidates: ${candidates?.length ?? 0}`);
  if (!candidates?.length) return;

  const service = getPostingService();
  for (const c of candidates as Array<{ id: string; late_post_id: string; status: string }>) {
    try {
      const z = await service.getPostStatus(c.late_post_id);
      console.log(
        `OK  ${c.late_post_id} db=${c.status} zernio platforms=${z.platforms.length} ${z.platforms
          .map((p) => `${p.profileId.slice(0, 6)}=${p.status}`)
          .join(',')}`,
      );
    } catch (err) {
      console.log(
        `ERR ${c.late_post_id} db=${c.status}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
