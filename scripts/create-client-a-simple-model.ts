/**
 * One-off: create client A Simple Model (https://www.asimplemodel.com/) with primary POC.
 *
 * Usage: npx tsx scripts/create-client-a-simple-model.ts
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { loadEnvLocal } from './load-env-local';
import { createAdminClient } from '@/lib/supabase/admin';

loadEnvLocal();

const CLIENT_NAME = 'A Simple Model';
const CLIENT_SLUG = 'a-simple-model';
const WEBSITE_URL = 'https://www.asimplemodel.com/';
const POC_NAME = 'Peter Lynch';
const POC_EMAIL = 'phlynch@stephengould.com';

async function main() {
  const admin = createAdminClient();

  const { data: existing } = await admin.from('clients').select('id, slug').eq('slug', CLIENT_SLUG).maybeSingle();

  if (existing?.id) {
    console.log('Client already exists:', CLIENT_SLUG, existing.id);
    const { data: contacts } = await admin
      .from('contacts')
      .select('id, name, email, is_primary')
      .eq('client_id', existing.id);
    console.log('Contacts:', contacts ?? []);
    return;
  }

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
      industry: 'Financial education',
      website_url: WEBSITE_URL,
      target_audience:
        'Aspiring and early-career financial analysts, private equity professionals, students, and teams who want practical financial modeling and LBO training.',
      brand_voice:
        'Clear, approachable, and practitioner-led — complex finance made simple without dumbing it down.',
      topic_keywords: [
        'financial modeling',
        'LBO',
        'private equity',
        'Excel',
        'financial statements',
        'valuation',
      ],
      description:
        'ASM (A Simple Model) offers financial modeling and private equity training — curriculum, ASM+ subscriptions, and case-study content for analysts and professionals.',
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

  const { error: contactErr } = await admin.from('contacts').insert({
    client_id: client.id,
    name: POC_NAME,
    email: POC_EMAIL,
    is_primary: true,
    project_role: 'Primary contact',
  });

  if (contactErr) {
    console.warn('Client created but contact insert failed:', contactErr.message);
  }

  console.log('Created client:', CLIENT_NAME, client.id);
  console.log(`Admin URL: /admin/clients/${CLIENT_SLUG}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
