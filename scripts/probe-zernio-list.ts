/**
 * Sanity-check what Zernio.listPosts actually returns so we know if my
 * orphan audit was meaningful or if listPosts hides scheduled-future posts.
 *
 *   npx tsx scripts/probe-zernio-list.ts
 */

import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const FB_ACCOUNT = '69e0f8347dea335c2bfdcb0f';
const TIKTOK_ACCOUNT = '69e114a17dea335c2bfe684d';

async function main() {
  const { getPostingService } = await import('@/lib/posting');
  const service = getPostingService();

  for (const variant of [
    { name: 'no filter, limit=500', q: { limit: 500 } },
    { name: 'status=scheduled, limit=200', q: { status: 'scheduled', limit: 200 } },
    { name: 'platform=facebook, status=scheduled, limit=200', q: { platform: 'facebook', status: 'scheduled', limit: 200 } },
  ]) {
    const posts = await service.listPosts(variant.q);
    const fb = posts.filter((p) =>
      p.platforms.some((pl) => pl.accountId === FB_ACCOUNT),
    );
    const tt = posts.filter((p) =>
      p.platforms.some((pl) => pl.accountId === TIKTOK_ACCOUNT),
    );
    const may = posts.filter(
      (p) =>
        p.scheduledFor &&
        p.scheduledFor >= '2026-05-01' &&
        p.scheduledFor < '2026-06-01',
    );
    console.log(
      `\n${variant.name}: total=${posts.length} avondale-fb=${fb.length} avondale-tt=${tt.length} may2026=${may.length}`,
    );
    if (may.length > 0) {
      for (const p of may.slice(0, 15)) {
        console.log(
          `  ${p.id} ${p.scheduledFor?.slice(0, 10)} status=${p.status} accts=${p.platforms.map((pl) => pl.accountId).join(',')} :: ${p.content.slice(0, 50).replace(/\n/g, ' ')}`,
        );
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
