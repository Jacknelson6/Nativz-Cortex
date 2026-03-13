/**
 * Backfill wikilinks into existing brand profile entries.
 *
 * For each client with a brand profile, this script asks the AI to rewrite
 * the profile content with [[wikilinks]] referencing other knowledge entries
 * (web pages, notes, etc.) by their exact titles.
 *
 * Usage:
 *   npx tsx scripts/backfill-wikilinks.ts
 *   npx tsx scripts/backfill-wikilinks.ts --dry-run
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// ── Load env ────────────────────────────────────────────────────────────────
const envPath = resolve(import.meta.dirname ?? __dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DRY_RUN = process.argv.includes('--dry-run');

async function createCompletion(prompt: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function backfillClient(clientId: string, clientName: string) {
  // Get the current brand profile
  const { data: profiles } = await admin
    .from('client_knowledge_entries')
    .select('id, title, content')
    .eq('client_id', clientId)
    .eq('type', 'brand_profile')
    .is('metadata->superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(1);

  const profile = profiles?.[0];
  if (!profile || !profile.content) {
    console.log(`  ⏭ No brand profile found`);
    return;
  }

  // Get all other entries for this client (titles to link to)
  const { data: entries } = await admin
    .from('client_knowledge_entries')
    .select('id, title, type')
    .eq('client_id', clientId)
    .neq('type', 'brand_profile');

  const linkableTitles = (entries ?? []).map((e) => e.title);

  if (linkableTitles.length === 0) {
    console.log(`  ⏭ No other entries to link to`);
    return;
  }

  // Get contacts for this client
  const { data: contacts } = await admin
    .from('contacts')
    .select('full_name')
    .eq('client_id', clientId)
    .limit(20);

  const contactNames = (contacts ?? []).map((c) => c.full_name).filter(Boolean);

  const prompt = `You are rewriting a brand profile to add Obsidian-style wikilinks ([[Entry Title]]).

Here is the existing brand profile content:

<profile>
${profile.content}
</profile>

Here are the exact titles of other knowledge entries you can link to:

<linkable_entries>
${linkableTitles.map((t) => `- ${t}`).join('\n')}
</linkable_entries>

${contactNames.length > 0 ? `<contacts>\n${contactNames.map((n) => `- ${n}`).join('\n')}\n</contacts>` : ''}

Rewrite the profile content with these rules:
1. Keep ALL existing content, formatting, and structure intact
2. Add [[Entry Title]] wikilinks wherever a topic matches a linkable entry title
3. Reference contacts by name: [[Contact Name]]
4. Only use titles from the lists above — do NOT invent titles
5. Use wikilinks naturally within sentences
6. Every section should link to relevant entries where the data supports it
7. Do NOT add any new content — only add wikilinks to existing text

Return ONLY the rewritten profile content, no preamble or explanation.`;

  const rewritten = await createCompletion(prompt);

  if (!rewritten || rewritten.length < profile.content.length * 0.5) {
    console.log(`  ⚠ AI response too short or empty, skipping`);
    return;
  }

  // Count wikilinks added
  const originalLinks = (profile.content.match(/\[\[[^\]]+\]\]/g) ?? []).length;
  const newLinks = (rewritten.match(/\[\[[^\]]+\]\]/g) ?? []).length;
  const added = newLinks - originalLinks;

  if (added <= 0) {
    console.log(`  ⏭ No new wikilinks to add`);
    return;
  }

  console.log(`  📝 ${added} wikilinks added (${originalLinks} → ${newLinks})`);

  if (DRY_RUN) {
    console.log(`  🏜 Dry run — not saving`);
    return;
  }

  // Update the entry
  const { error } = await admin
    .from('client_knowledge_entries')
    .update({
      content: rewritten,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.id);

  if (error) {
    console.log(`  ❌ Failed to update: ${error.message}`);
  } else {
    console.log(`  ✅ Updated`);
  }
}

async function main() {
  console.log(DRY_RUN ? '🏜 DRY RUN MODE\n' : '🚀 BACKFILL MODE\n');

  // Get all clients
  const { data: clients } = await admin
    .from('clients')
    .select('id, name')
    .order('name');

  if (!clients || clients.length === 0) {
    console.log('No active clients found');
    return;
  }

  console.log(`Processing ${clients.length} clients...\n`);

  for (const client of clients) {
    console.log(`${client.name}`);
    try {
      await backfillClient(client.id, client.name);
    } catch (err) {
      console.log(`  ❌ Error: ${(err as Error).message}`);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
