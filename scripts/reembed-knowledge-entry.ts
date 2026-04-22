import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Load .env.local without requiring a dotenv package (matches other scripts in
// this repo). Only parses simple KEY=VALUE lines.
try {
  const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawVal] = match;
    if (process.env[key]) continue;
    const val = rawVal.replace(/^['"]|['"]$/g, '');
    process.env[key] = val;
  }
} catch {
  /* .env.local optional */
}

import { embedKnowledgeEntry } from '@/lib/ai/embeddings';

const entryId = process.argv[2];
if (!entryId) {
  console.error('Usage: tsx scripts/reembed-knowledge-entry.ts <entry_id>');
  process.exit(1);
}

(async () => {
  const ok = await embedKnowledgeEntry(entryId);
  console.log(ok ? `Re-embedded ${entryId}` : `Failed to re-embed ${entryId}`);
  process.exit(ok ? 0 : 1);
})();
