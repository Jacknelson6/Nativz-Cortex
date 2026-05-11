/**
 * Diagnostic: ask Zernio directly which accounts it has attached to
 * Avondale's late_profile_id, so we know whether the IG + YT rows we
 * already have (with null late_account_id) need to be repaired or
 * deleted.
 *
 * Run: npx tsx scripts/diag-avondale-zernio.ts
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

async function main() {
  const { ZernioPostingService } = await import('@/lib/posting');
  const service = new ZernioPostingService();
  const PROFILE = '69b02c8ce164478f93d66e5b';

  const all = await service.getConnectedProfiles();
  const mine = all.filter((a) => a.profileId === PROFILE);
  console.log(`[zernio] ${mine.length} accounts on profile ${PROFILE}`);
  for (const a of mine) {
    console.log(
      `  - ${a.platform} @${a.username || '?'} late=${a.id} active=${a.isActive}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
