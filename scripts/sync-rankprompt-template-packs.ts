/**
 * Upload one JSON file per Digital Products Kandy template to Supabase Storage
 * (kandy-templates/prompt-packs/rankprompt/{templateId}.json) and set
 * kandy_templates.rankprompt_prompt_pack_url.
 *
 * Prereqs: migration 059 applied; templates have prompt_schema; .env.local with
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage:
 *   npx tsx scripts/sync-rankprompt-template-packs.ts
 *   npx tsx scripts/sync-rankprompt-template-packs.ts --dry-run
 *   npx tsx scripts/sync-rankprompt-template-packs.ts --limit 5
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

import { buildRankPromptBrandContext, RANKPROMPT_BRAND_KIT_RAW, RANKPROMPT_COPY_POOL } from '../lib/ad-creatives/rankprompt-brand-pack';
import { buildRankPromptTemplatePackFile } from '../lib/ad-creatives/rankprompt-template-pack-json';
import type { AdPromptSchema } from '../lib/ad-creatives/types';

const envPath = resolve(process.cwd(), '.env.local');
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i === -1) continue;
  const k = t.slice(0, i);
  let v = t.slice(i + 1);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET = 'kandy-templates';
const PREFIX = 'prompt-packs/rankprompt';

interface Row {
  id: string;
  collection_name: string;
  page_index: number;
  image_url: string;
  vertical: string | null;
  ad_category: string | null;
  prompt_schema: AdPromptSchema | null;
}

function dedupeByCollectionPage(rows: Row[]): Row[] {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const r of rows) {
    const key = `${r.collection_name}:${r.page_index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return '';
  return res.text();
}

function publicObjectUrl(path: string): string {
  const base = supabaseUrl.replace(/\/$/, '');
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limIdx = args.indexOf('--limit');
  const limit = limIdx !== -1 ? parseInt(args[limIdx + 1], 10) : undefined;

  const agentMd = await fetchText(`${RANKPROMPT_BRAND_KIT_RAW}/docs/AGENT-INSTRUCTIONS.md`);
  const agentExcerpt = agentMd
    ? agentMd.slice(0, 12_000)
    : 'Follow RankPrompt brand kit: purple #6b4eff, RankPrompt one word, Inter + Roboto.';
  const brandContext = buildRankPromptBrandContext(agentExcerpt);

  const { data: raw, error } = await supabase
    .from('kandy_templates')
    .select('id, collection_name, page_index, image_url, vertical, ad_category, prompt_schema')
    .eq('is_active', true)
    .not('prompt_schema', 'is', null)
    .in('vertical', ['saas', 'digital_products'])
    .or('collection_name.ilike.Digital Products%,source_brand.eq."Kandy - Digital Products"')
    .order('page_index', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  let rows = dedupeByCollectionPage((raw ?? []) as Row[]);
  rows = rows.filter((r) => r.prompt_schema && typeof r.prompt_schema === 'object');
  if (limit !== undefined && Number.isFinite(limit)) {
    rows = rows.slice(0, limit);
  }

  console.log(`Syncing ${rows.length} template pack(s)${dryRun ? ' (dry run)' : ''}…`);

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const sampleCopy = RANKPROMPT_COPY_POOL[i % RANKPROMPT_COPY_POOL.length];
    const pack = buildRankPromptTemplatePackFile(
      {
        id: r.id,
        collection_name: r.collection_name,
        page_index: r.page_index,
        image_url: r.image_url,
        vertical: r.vertical,
        ad_category: r.ad_category,
      },
      r.prompt_schema as AdPromptSchema,
      sampleCopy,
      brandContext,
      agentExcerpt,
    );

    const path = `${PREFIX}/${r.id}.json`;
    const body = JSON.stringify(pack, null, 2);
    const url = publicObjectUrl(path);

    if (dryRun) {
      console.log(`  [dry-run] ${path} (${(body.length / 1024).toFixed(1)} KB)`);
      ok++;
      continue;
    }

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, Buffer.from(body, 'utf-8'), {
      contentType: 'application/json; charset=utf-8',
      upsert: true,
    });

    if (upErr) {
      console.error(`  FAIL upload ${r.id}:`, upErr.message);
      fail++;
      continue;
    }

    const { error: dbErr } = await supabase
      .from('kandy_templates')
      .update({ rankprompt_prompt_pack_url: url })
      .eq('id', r.id);

    if (dbErr) {
      console.error(`  FAIL db ${r.id}:`, dbErr.message);
      fail++;
      continue;
    }

    ok++;
    if (ok % 10 === 0 || ok === rows.length) {
      console.log(`  … ${ok}/${rows.length}`);
    }
  }

  console.log(`\nDone. Uploaded + linked: ${ok}, failed: ${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
