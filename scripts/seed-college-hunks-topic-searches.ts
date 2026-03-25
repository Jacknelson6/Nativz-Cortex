/**
 * Seeds two completed topic_searches for College Hunks Hauling Junk with rich synthetic SERP + analysis
 * (junk removal + moving queries). No live search API calls.
 *
 * Usage:
 *   npx tsx scripts/seed-college-hunks-topic-searches.ts
 *
 * Env:
 *   COLLEGE_HUNKS_CLIENT_ID=<uuid>     — optional; else resolves slug college-hunks-hauling-junk
 *   COLLEGE_HUNKS_REPLACE_MATCHING=1   — update latest row per query+client when present; else insert new
 */
import { loadEnvLocal } from './load-env-local';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildCollegeHunksTopicSearchRow,
  CHHJ_QUERY_JUNK,
  CHHJ_QUERY_MOVING,
} from '@/lib/seed/college-hunks-topic-search-rows';

loadEnvLocal();

async function resolveClientId(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const envId = process.env.COLLEGE_HUNKS_CLIENT_ID?.trim();
  if (envId) return envId;
  const { data } = await admin
    .from('clients')
    .select('id')
    .eq('slug', 'college-hunks-hauling-junk')
    .maybeSingle();
  return data?.id ?? null;
}

async function resolveCreatedBy(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const { data } = await admin.from('users').select('id').eq('role', 'admin').limit(1).maybeSingle();
  return data?.id ?? null;
}

async function upsertSearch(
  admin: ReturnType<typeof createAdminClient>,
  row: Record<string, unknown>,
  replace: boolean,
) {
  const query = row.query as string;
  const clientId = row.client_id as string;

  if (replace) {
    const { data: existing } = await admin
      .from('topic_searches')
      .select('id')
      .eq('client_id', clientId)
      .eq('query', query)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await admin.from('topic_searches').update(row).eq('id', existing.id);
      if (error) throw error;
      console.log('Updated:', query, '→', `/admin/search/${existing.id}`);
      return existing.id;
    }
  }

  const { data: inserted, error } = await admin.from('topic_searches').insert(row).select('id').single();
  if (error) throw error;
  console.log('Inserted:', query, '→', `/admin/search/${inserted?.id}`);
  return inserted?.id;
}

async function main() {
  const admin = createAdminClient();
  const clientId = await resolveClientId(admin);
  if (!clientId) {
    console.error('No client found. Create College Hunks first (npm run setup:college-hunks) or set COLLEGE_HUNKS_CLIENT_ID.');
    process.exit(1);
  }

  const createdBy = await resolveCreatedBy(admin);
  const now = new Date().toISOString();
  const replace = process.env.COLLEGE_HUNKS_REPLACE_MATCHING === '1' || process.env.COLLEGE_HUNKS_REPLACE_MATCHING === 'true';

  const junkRow = buildCollegeHunksTopicSearchRow({
    query: CHHJ_QUERY_JUNK,
    clientId,
    createdBy,
    completedAt: now,
    theme: 'junk',
  });

  const moveRow = buildCollegeHunksTopicSearchRow({
    query: CHHJ_QUERY_MOVING,
    clientId,
    createdBy,
    completedAt: now,
    theme: 'moving',
  });

  await upsertSearch(admin, junkRow, replace);
  await upsertSearch(admin, moveRow, replace);

  console.log('\nClient:', '/admin/clients/college-hunks-hauling-junk');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
