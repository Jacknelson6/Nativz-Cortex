/**
 * One-off: create College Hunks Hauling Junk client (if missing) and optionally run Brand DNA generation.
 * Topic research rows are filled separately via synthetic data (see npm run seed:college-hunks-searches).
 *
 * Usage:
 *   npx tsx scripts/college-hunks-setup.ts
 *   npx tsx scripts/seed-college-hunks-topic-searches.ts
 *
 * Optional env:
 *   COLLEGE_HUNKS_SKIP_BRAND_DNA=1    — skip crawl + AI Brand DNA
 *   COLLEGE_HUNKS_FORCE_BRAND_DNA=1   — re-run Brand DNA even if status is already draft/active
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (Brand DNA also needs AI/crawl keys).
 */
import { loadEnvLocal } from './load-env-local';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateBrandDNA } from '@/lib/brand-dna';

loadEnvLocal();

const CLIENT_NAME = 'College Hunks Hauling Junk';
const CLIENT_SLUG = 'college-hunks-hauling-junk';
const WEBSITE_URL = 'https://www.collegehunkshaulingjunk.com/';

async function main() {
  const admin = createAdminClient();

  const { data: existing } = await admin.from('clients').select('id, slug').eq('slug', CLIENT_SLUG).maybeSingle();

  let clientId: string;

  if (existing?.id) {
    clientId = existing.id;
    console.log('Client already exists:', CLIENT_SLUG, clientId);
  } else {
    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .insert({
        name: CLIENT_NAME,
        slug: CLIENT_SLUG,
        type: 'client',
      })
      .select('id')
      .single();

    if (orgErr || !org) {
      throw new Error(`Failed to create organization: ${orgErr?.message}`);
    }

    const { data: client, error: clientErr } = await admin
      .from('clients')
      .insert({
        name: CLIENT_NAME,
        slug: CLIENT_SLUG,
        organization_id: org.id,
        industry: 'Moving & junk removal',
        website_url: WEBSITE_URL,
        target_audience:
          'Homeowners and renters planning local moves; people clearing estates, renovations, or clutter who want donation-first hauling and trustworthy crews.',
        brand_voice: 'Upbeat, professional, and stress-reducing — heavy lifting with a friendly, college-team energy.',
        topic_keywords: [
          'junk removal',
          'local moving',
          'donation pickup',
          'hauling',
          'franchise moving',
          'estate cleanout',
        ],
        description:
          'Nationwide junk removal and local moving franchise — same-day hauling, donation partnerships, and labor-first positioning (College Hunks Hauling Junk & Moving).',
        services: ['SMM', 'Paid Media', 'Editing'],
        agency: 'Nativz',
        is_active: true,
        onboarded_via: 'script',
      })
      .select('id')
      .single();

    if (clientErr || !client) {
      throw new Error(`Failed to create client: ${clientErr?.message}`);
    }

    clientId = client.id;
    console.log('Created client:', CLIENT_NAME, clientId);
  }

  const { data: clientRow } = await admin
    .from('clients')
    .select('brand_dna_status')
    .eq('id', clientId)
    .single();

  const dnaDone =
    clientRow?.brand_dna_status &&
    clientRow.brand_dna_status !== 'none' &&
    clientRow.brand_dna_status !== 'generating';

  if (!process.env.COLLEGE_HUNKS_SKIP_BRAND_DNA && (process.env.COLLEGE_HUNKS_FORCE_BRAND_DNA || !dnaDone)) {
    console.log('Running Brand DNA (crawl + AI) — this may take several minutes...');
    await generateBrandDNA(clientId, WEBSITE_URL, {
      onProgress: async (_status, pct, label) => {
        console.log(`  [Brand DNA] ${pct}% — ${label}`);
      },
    });
    console.log('Brand DNA generation finished.');
  } else if (process.env.COLLEGE_HUNKS_SKIP_BRAND_DNA) {
    console.log('Skipped Brand DNA (COLLEGE_HUNKS_SKIP_BRAND_DNA=1).');
  } else {
    console.log('Skipped Brand DNA (already have guideline; use COLLEGE_HUNKS_FORCE_BRAND_DNA=1 to refresh).');
  }

  console.log(`\nNext: npm run seed:college-hunks-searches`);
  console.log(`Client: /admin/clients/${CLIENT_SLUG}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
