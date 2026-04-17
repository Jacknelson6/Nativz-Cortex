/**
 * Gemini text-embedding-004 via Google AI Studio.
 *
 * 768-dimensional embeddings for semantic search over the knowledge base.
 * Free tier: 1,500 requests/minute — more than enough for batch + query use.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { logUsage } from './usage';

const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const EMBEDDING_DIMS = 768;
const MAX_BATCH_SIZE = 100; // Gemini batch limit

// ---------------------------------------------------------------------------
// Core embedding function
// ---------------------------------------------------------------------------

/**
 * Generate an embedding vector for a single text string.
 * Returns a 768-dimensional float array, or null on failure.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!apiKey) {
    console.error('GOOGLE_AI_STUDIO_KEY not configured');
    return null;
  }

  try {
    const res = await fetch(
      `${GEMINI_API_URL}/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${GEMINI_EMBEDDING_MODEL}`,
          content: { parts: [{ text: text.slice(0, 10_000) }] },
          outputDimensionality: EMBEDDING_DIMS,
        }),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      console.error(`Gemini embedding error ${res.status}:`, err.slice(0, 300));
      return null;
    }

    const data = await res.json();
    const values: number[] = data?.embedding?.values;
    if (!values || values.length !== EMBEDDING_DIMS) {
      console.error('Unexpected embedding response shape:', JSON.stringify(data).slice(0, 200));
      return null;
    }

    await logUsage({
      service: 'gemini',
      model: GEMINI_EMBEDDING_MODEL,
      feature: 'knowledge_embedding',
      inputTokens: Math.ceil(text.length / 4),
      outputTokens: 0,
      totalTokens: Math.ceil(text.length / 4),
      costUsd: 0, // Free tier
    }).catch(() => {});

    return values;
  } catch (error) {
    console.error('generateEmbedding error:', error);
    return null;
  }
}

/**
 * Describe-then-embed model. Google AI Studio retired
 * `gemini-embedding-exp-03-07` (the only direct multimodal embedding
 * path) so we use Gemini 2.5 Flash vision to produce a short visual
 * description, concatenate it with the caller's text, and embed the
 * combined string with `gemini-embedding-001`. Keeps 768 dims + the
 * existing Google AI Studio key and still captures image content.
 */
const GEMINI_VISION_DESCRIBE_MODEL = 'gemini-2.5-flash';
const VISION_DESCRIPTION_MAX_CHARS = 600;

async function describeImageForEmbedding(
  text: string,
  imageUrl: string,
  apiKey: string,
): Promise<string | null> {
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) });
    if (!imgRes.ok) return null;

    const contentType = imgRes.headers.get('content-type') ?? 'image/png';
    const buffer = await imgRes.arrayBuffer();
    if (buffer.byteLength > 2 * 1024 * 1024) return null;
    const base64 = Buffer.from(buffer).toString('base64');

    const prompt =
      'Describe this image for semantic search in 1–3 sentences. ' +
      'Mention dominant colors, style (e.g. flat, photo, illustrated), subject, ' +
      'layout, and any visible text or logos. Plain sentences, no bullet points, ' +
      'no preamble.\n\nContext: ' +
      text.slice(0, 500);

    const res = await fetch(
      `${GEMINI_API_URL}/${GEMINI_VISION_DESCRIBE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: contentType, data: base64 } },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 256,
            temperature: 0.2,
          },
        }),
      },
    );

    if (!res.ok) return null;

    const data = await res.json();
    const description: string | undefined =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!description) return null;

    await logUsage({
      service: 'gemini',
      model: GEMINI_VISION_DESCRIBE_MODEL,
      feature: 'knowledge_image_description',
      inputTokens: Math.ceil(text.length / 4) + Math.ceil(buffer.byteLength / 1024),
      outputTokens: Math.ceil(description.length / 4),
      totalTokens:
        Math.ceil(text.length / 4) +
        Math.ceil(buffer.byteLength / 1024) +
        Math.ceil(description.length / 4),
      costUsd: 0,
    }).catch(() => {});

    return description.trim().slice(0, VISION_DESCRIPTION_MAX_CHARS);
  } catch (error) {
    console.warn('describeImageForEmbedding error:', error);
    return null;
  }
}

/**
 * Generate a multimodal embedding for text + image.
 * Describes the image with Gemini 2.5 Flash vision, concatenates the
 * description with the caller's text, and embeds the combined string
 * with gemini-embedding-001. Falls back to text-only if the image can't
 * be fetched or described. Output is 768 dimensions.
 */
export async function generateMultimodalEmbedding(
  text: string,
  imageUrl: string,
): Promise<number[] | null> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!apiKey) {
    console.error('GOOGLE_AI_STUDIO_KEY not configured');
    return null;
  }

  const description = await describeImageForEmbedding(text, imageUrl, apiKey);
  if (!description) {
    return generateEmbedding(text);
  }

  const combined = `${text}\n\n[Visual description]: ${description}`;
  return generateEmbedding(combined);
}

/**
 * Generate embeddings for multiple texts in a single API call.
 */
export async function generateEmbeddingsBatch(
  texts: string[],
): Promise<(number[] | null)[]> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!apiKey) return texts.map(() => null);

  const results: (number[] | null)[] = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);

    try {
      const res = await fetch(
        `${GEMINI_API_URL}/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${GEMINI_EMBEDDING_MODEL}`,
            requests: batch.map((text) => ({
              model: `models/${GEMINI_EMBEDDING_MODEL}`,
              content: { parts: [{ text: text.slice(0, 10_000) }] },
              outputDimensionality: EMBEDDING_DIMS,
            })),
          }),
        },
      );

      if (!res.ok) {
        const err = await res.text();
        console.error(`Gemini batch embedding error ${res.status}:`, err.slice(0, 300));
        results.push(...batch.map(() => null));
        continue;
      }

      const data = await res.json();
      const embeddings = data?.embeddings ?? [];

      for (let j = 0; j < batch.length; j++) {
        const values = embeddings[j]?.values;
        results.push(values?.length === EMBEDDING_DIMS ? values : null);
      }

      await logUsage({
        service: 'gemini',
        model: GEMINI_EMBEDDING_MODEL,
        feature: 'knowledge_embedding_batch',
        inputTokens: batch.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0),
        outputTokens: 0,
        totalTokens: batch.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0),
        costUsd: 0,
      }).catch(() => {});
    } catch (error) {
      console.error('Batch embedding error:', error);
      results.push(...batch.map(() => null));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Knowledge base embedding operations
// ---------------------------------------------------------------------------

/**
 * Generate and store embeddings for all knowledge entries that don't have one.
 * Returns the count of entries that were embedded.
 */
export async function embedAllKnowledgeEntries(): Promise<{
  embedded: number;
  failed: number;
  skipped: number;
}> {
  const admin = createAdminClient();

  // Get entries without embeddings
  const { data: entries, error } = await admin
    .from('client_knowledge_entries')
    .select('id, title, content')
    .is('embedding', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch entries: ${error.message}`);
  if (!entries || entries.length === 0) return { embedded: 0, failed: 0, skipped: 0 };

  // Build texts for embedding: title + first 2000 chars of content
  const texts = entries.map((e) => {
    const snippet = (e.content ?? '').slice(0, 2000);
    return `${e.title}\n\n${snippet}`;
  });

  // Batch embed
  const embeddings = await generateEmbeddingsBatch(texts);

  let embedded = 0;
  let failed = 0;

  // Store embeddings in DB
  for (let i = 0; i < entries.length; i++) {
    const embedding = embeddings[i];
    if (!embedding) {
      failed++;
      continue;
    }

    const { error: updateError } = await admin
      .from('client_knowledge_entries')
      .update({ embedding: JSON.stringify(embedding) })
      .eq('id', entries[i].id);

    if (updateError) {
      console.error(`Failed to store embedding for ${entries[i].id}:`, updateError.message);
      failed++;
    } else {
      embedded++;
    }
  }

  return { embedded, failed, skipped: 0 };
}

/**
 * Generate and store an embedding for a single knowledge entry.
 * Call this after creating/updating an entry.
 */
export async function embedKnowledgeEntry(entryId: string): Promise<boolean> {
  const admin = createAdminClient();

  const { data: entry, error } = await admin
    .from('client_knowledge_entries')
    .select('id, title, content')
    .eq('id', entryId)
    .single();

  if (error || !entry) return false;

  const text = `${entry.title}\n\n${(entry.content ?? '').slice(0, 2000)}`;
  const embedding = await generateEmbedding(text);
  if (!embedding) return false;

  const { error: updateError } = await admin
    .from('client_knowledge_entries')
    .update({ embedding: JSON.stringify(embedding) })
    .eq('id', entryId);

  return !updateError;
}
