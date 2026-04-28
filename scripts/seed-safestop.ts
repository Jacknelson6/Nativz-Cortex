/**
 * One-shot setup for SafeStop's first calendar:
 *   1. Fix the spelling — clients.name is "Safe Stop" but the brand is one word
 *   2. Wire the Zernio profile onto the Cortex client (late_profile_id was null,
 *      which is why social_profiles never populated)
 *   3. Seed caption_cta + caption_hashtags (currently null) so generated
 *      captions land with a real reservation prompt instead of "Get in touch".
 *
 *   npx tsx scripts/seed-safestop.ts          # dry-run
 *   npx tsx scripts/seed-safestop.ts --apply  # apply
 *
 * Source data (thesafestop.com): gated 24/7 secure truck parking in
 * Hutchins, TX at I-20 & I-45. Free showers, restrooms, Wi-Fi lounge, dog
 * park. Reservations via thesafestop.com or (214) 435-9555.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';

const SLUG = 'safe-stop';
const NEW_NAME = 'SafeStop';
const ZERNIO_PROFILE_ID = '69e0e04a56ca010a5141e1ed';

const CAPTION_CTA =
  'Reserve secure overnight parking at SafeStop — gated, 24/7 monitored, free showers + Wi-Fi lounge. Hutchins, TX (I-20 & I-45). Book at thesafestop.com or call (214) 435-9555.';

const CAPTION_HASHTAGS = [
  'truckparking',
  'trucking',
  'truckersofinstagram',
  'dallastrucking',
  'safetrucking',
  'cargotheftprevention',
  'truckdriverlife',
  'i20trucking',
  'truckstop',
];

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} — seed SafeStop client\n`);

  const admin = createAdminClient();
  const { data: client, error: readErr } = await admin
    .from('clients')
    .select('id, name, slug, late_profile_id, caption_cta, caption_hashtags')
    .eq('slug', SLUG)
    .maybeSingle<{
      id: string;
      name: string;
      slug: string;
      late_profile_id: string | null;
      caption_cta: string | null;
      caption_hashtags: string[] | null;
    }>();
  if (readErr) throw new Error(readErr.message);
  if (!client) throw new Error(`No client with slug=${SLUG}`);

  console.log(`Client ${client.id}`);
  console.log(`  name              ${client.name}  →  ${NEW_NAME}`);
  console.log(`  late_profile_id   ${client.late_profile_id ?? '(null)'}  →  ${ZERNIO_PROFILE_ID}`);
  console.log(`  caption_cta       ${client.caption_cta ? '(set)' : '(null)'}  →  set`);
  console.log(`  caption_hashtags  ${(client.caption_hashtags ?? []).length} entries  →  ${CAPTION_HASHTAGS.length} entries`);

  if (!apply) {
    console.log('\n(dry-run — re-run with --apply)');
    return;
  }

  const { error: updErr } = await admin
    .from('clients')
    .update({
      name: NEW_NAME,
      late_profile_id: ZERNIO_PROFILE_ID,
      caption_cta: CAPTION_CTA,
      caption_hashtags: CAPTION_HASHTAGS,
    })
    .eq('id', client.id);
  if (updErr) throw new Error(`update failed: ${updErr.message}`);
  console.log('\n✓ SafeStop client updated');
}

main().catch((err) => {
  console.error('\n✗ seed-safestop crashed:', err);
  process.exit(1);
});
