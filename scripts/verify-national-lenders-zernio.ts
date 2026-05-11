/**
 * One-off: confirm Zernio is still holding the National Lenders 5-11 and
 * 5-12 posts. Reads each late_post_id and prints scheduledFor + status so
 * we know there are no surprises before the client meeting on 5-12.
 *
 * Run with: npx tsx scripts/verify-national-lenders-zernio.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const POSTS = [
  { sched: '2026-05-11 17:00 UTC', latePostId: '69f36358fa167529f3321903' },
  { sched: '2026-05-12 17:00 UTC', latePostId: '69f3635c817b9ce35cd4ccd4' },
];

async function main() {
  const { getPostingService } = await import('@/lib/posting');
  const service = getPostingService();
  for (const { sched, latePostId } of POSTS) {
    try {
      const status = await service.getPostStatus(latePostId);
      console.log(`[ok] ${sched} (${latePostId})`);
      console.log(JSON.stringify(status, null, 2));
    } catch (err) {
      console.error(`[err] ${sched} (${latePostId}):`, err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
