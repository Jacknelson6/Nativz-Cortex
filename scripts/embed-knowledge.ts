/**
 * Batch-embed all knowledge entries missing embeddings.
 * Uses Gemini text-embedding-004 via Google AI Studio.
 *
 * Usage: npx tsx scripts/embed-knowledge.ts
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-embedding-001';
const DIMS = 768;
const BATCH_SIZE = 100;

const GOOGLE_AI_STUDIO_KEY = process.env.GOOGLE_AI_STUDIO_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GOOGLE_AI_STUDIO_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars: GOOGLE_AI_STUDIO_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

interface Entry {
  id: string;
  title: string;
  content: string;
}

async function fetchEntries(): Promise<Entry[]> {
  const url = `${SUPABASE_URL}/rest/v1/client_knowledge_entries?embedding=is.null&select=id,title,content&order=created_at.desc`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase fetch error: ${res.status}`);
  return res.json();
}

async function batchEmbed(texts: string[]): Promise<(number[] | null)[]> {
  const res = await fetch(
    `${GEMINI_API_URL}/${MODEL}:batchEmbedContents?key=${GOOGLE_AI_STUDIO_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${MODEL}`,
        requests: texts.map((text) => ({
          model: `models/${MODEL}`,
          content: { parts: [{ text: text.slice(0, 10_000) }] },
          outputDimensionality: DIMS,
        })),
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`Gemini error ${res.status}:`, err.slice(0, 300));
    return texts.map(() => null);
  }

  const data = await res.json();
  const embeddings = data?.embeddings ?? [];
  return texts.map((_, i) => {
    const values = embeddings[i]?.values;
    return values?.length === DIMS ? values : null;
  });
}

async function updateEmbedding(id: string, embedding: number[]): Promise<boolean> {
  const url = `${SUPABASE_URL}/rest/v1/client_knowledge_entries?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ embedding: JSON.stringify(embedding) }),
  });
  return res.ok;
}

async function main() {
  console.log('Fetching entries without embeddings...');
  const entries = await fetchEntries();
  console.log(`Found ${entries.length} entries to embed`);

  let embedded = 0;
  let failed = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const texts = batch.map((e) => `${e.title}\n\n${(e.content ?? '').slice(0, 2000)}`);

    console.log(`Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(entries.length / BATCH_SIZE)} (${batch.length} entries)...`);

    const embeddings = await batchEmbed(texts);

    for (let j = 0; j < batch.length; j++) {
      const emb = embeddings[j];
      if (!emb) {
        failed++;
        continue;
      }
      const ok = await updateEmbedding(batch[j].id, emb);
      if (ok) {
        embedded++;
      } else {
        failed++;
      }
    }

    console.log(`  Progress: ${embedded} embedded, ${failed} failed`);

    // Small delay between batches to be nice to the API
    if (i + BATCH_SIZE < entries.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`\nDone! ${embedded} embedded, ${failed} failed out of ${entries.length} total`);
}

main().catch(console.error);
