/**
 * Seed the /generate skill into nerd_skills.
 * Run: npx tsx scripts/seed-generate-skill.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env. Load .env.local first.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  const content = fs.readFileSync(
    path.join(process.cwd(), 'docs/skills/generate.md'),
    'utf-8',
  );

  // Upsert by name so re-running updates rather than duplicates
  const { data: existing } = await supabase
    .from('nerd_skills')
    .select('id')
    .eq('name', '/generate — Branded deliverable export')
    .maybeSingle();

  const row = {
    name: '/generate — Branded deliverable export',
    description: 'Produces professionally branded PDF deliverables (video ideas, scripts, topic plans, audits). Teaches the Nerd how to structure output for the branded template.',
    content,
    keywords: ['generate', 'create', 'produce', 'build', 'video ideas', 'scripts', 'topic plan', 'content plan', 'audit', 'deliverable', 'pdf', 'export', 'download'],
    is_active: true,
    source: 'upload',
    harnesses: ['admin_nerd', 'admin_content_lab', 'portal_content_lab'],
    client_id: null,
    command_slug: 'generate',
  };

  if (existing?.id) {
    const { error } = await supabase
      .from('nerd_skills')
      .update({ ...row })
      .eq('id', existing.id);
    if (error) throw error;
    console.log('✓ Updated existing skill:', existing.id);
  } else {
    const { data, error } = await supabase
      .from('nerd_skills')
      .insert(row)
      .select('id')
      .single();
    if (error) throw error;
    console.log('✓ Created skill:', data.id);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
