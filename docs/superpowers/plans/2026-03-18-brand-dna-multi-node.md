# Brand DNA Multi-Node Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic `brand_guideline` knowledge entry into a hub-and-spoke graph of typed entries (category nodes + individual nodes for logos/screenshots) with multimodal embeddings.

**Architecture:** Brand DNA generation pipeline steps 1-5 stay identical. Step 6 (store) changes from creating 1 entry to creating 6+ category entries, N logo entries, N screenshot entries, and linking them all via `client_knowledge_links`. Hub keeps fat metadata for backward compat. Graph API updated to render links between entries.

**Tech Stack:** Supabase (Postgres + pgvector), Gemini Embedding 001 (text) + multimodal model (images), Next.js 15 API routes, Sigma.js graph renderer

**Spec:** `docs/superpowers/specs/2026-03-18-brand-dna-multi-node-design.md`

---

### Task 1: Database migration — widen type CHECK + ensure embedding column

**Files:**
- Create: `supabase/migrations/041_brand_dna_multi_node.sql`

- [x] **Step 1: Write migration SQL**

```sql
-- 041_brand_dna_multi_node.sql — Brand DNA multi-node split
-- Adds new entry types for split Brand DNA nodes and ensures embedding column exists

-- Widen the type CHECK constraint to include new Brand DNA sub-types
ALTER TABLE client_knowledge_entries DROP CONSTRAINT IF EXISTS client_knowledge_entries_type_check;
ALTER TABLE client_knowledge_entries ADD CONSTRAINT client_knowledge_entries_type_check
  CHECK (type IN (
    -- Existing types
    'brand_asset', 'brand_profile', 'brand_guideline', 'document',
    'web_page', 'note', 'idea', 'meeting_note',
    -- Brand DNA sub-types
    'visual_identity', 'verbal_identity', 'target_audience',
    'competitive_positioning', 'product_catalog',
    'brand_logo', 'brand_screenshot'
  ));

-- Ensure embedding column exists for semantic search (may already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_knowledge_entries' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE client_knowledge_entries ADD COLUMN embedding vector(768);
  END IF;
END $$;

-- Ensure index exists for vector similarity search
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_embedding
  ON client_knowledge_entries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

- [x] **Step 2: Apply migration**

Run: `npx supabase migration up` or apply via Supabase MCP `apply_migration` tool.
Expected: Migration applies cleanly. Verify with `list_tables` that the constraint is updated.

- [x] **Step 3: Commit**

```bash
git add supabase/migrations/041_brand_dna_multi_node.sql
git commit -m "feat(db): add Brand DNA sub-types to knowledge entries CHECK constraint"
```

---

### Task 2: TypeScript types — add new entry types + metadata interfaces

**Files:**
- Modify: `lib/knowledge/types.ts:1` (KnowledgeEntryType union)
- Modify: `lib/knowledge/types.ts:77-139` (add metadata interfaces after existing ones)

- [x] **Step 1: Update `KnowledgeEntryType` union**

In `lib/knowledge/types.ts`, replace line 1:

```typescript
// OLD:
export type KnowledgeEntryType = 'brand_asset' | 'brand_profile' | 'brand_guideline' | 'document' | 'web_page' | 'note' | 'idea' | 'meeting_note';

// NEW:
export type KnowledgeEntryType =
  | 'brand_asset' | 'brand_profile' | 'brand_guideline'
  | 'document' | 'web_page' | 'note' | 'idea' | 'meeting_note'
  | 'visual_identity' | 'verbal_identity' | 'target_audience'
  | 'competitive_positioning' | 'product_catalog'
  | 'brand_logo' | 'brand_screenshot';
```

- [x] **Step 2: Add metadata interfaces**

After the existing `BrandGuidelineMetadata` interface (after line 139), add:

```typescript
// Brand DNA sub-node metadata types
export interface VisualIdentityMetadata {
  colors: BrandColor[];
  fonts: BrandFont[];
  design_style: DesignStyle | null;
}

export interface VerbalIdentityMetadata {
  tone_primary: string | null;
  voice_attributes: string[];
  messaging_pillars: string[];
  vocabulary_patterns: string[];
  avoidance_patterns: string[];
}

export interface TargetAudienceMetadata {
  summary: string;
}

export interface CompetitivePositioningMetadata {
  positioning_statement: string;
}

export interface ProductCatalogMetadata {
  products: ProductItem[];
}

export interface BrandLogoMetadata {
  url: string;
  variant: 'primary' | 'dark' | 'light' | 'icon';
  format?: string;
}

export interface BrandScreenshotMetadata {
  url: string;
  page: string;
  source_url: string;
}

/** All Brand DNA entry types — used for hard-delete on regeneration */
export const BRAND_DNA_TYPES: KnowledgeEntryType[] = [
  'brand_guideline', 'visual_identity', 'verbal_identity',
  'target_audience', 'competitive_positioning', 'product_catalog',
  'brand_logo', 'brand_screenshot',
];
```

- [x] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors.

- [x] **Step 4: Commit**

```bash
git add lib/knowledge/types.ts
git commit -m "feat(types): add Brand DNA sub-node types and metadata interfaces"
```

---

### Task 3: Multimodal embedding function

**Files:**
- Modify: `lib/ai/embeddings.ts:73` (add after `generateEmbedding`)

- [x] **Step 1: Add `generateMultimodalEmbedding` function**

After the `generateEmbedding` function (after line 73), add:

```typescript
const GEMINI_MULTIMODAL_EMBEDDING_MODEL = 'gemini-embedding-exp-03-07';

/**
 * Generate a multimodal embedding for text + image.
 * Uses Gemini's multimodal embedding model. Falls back to text-only if image fails.
 * Output MUST be 768 dimensions to match the existing embedding column.
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

  try {
    // Fetch image and convert to base64
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) });
    if (!imgRes.ok) {
      console.warn(`Image fetch failed for ${imageUrl}, falling back to text-only`);
      return generateEmbedding(text);
    }

    const contentType = imgRes.headers.get('content-type') ?? 'image/png';
    const buffer = await imgRes.arrayBuffer();

    // Skip images > 2MB to stay within serverless limits
    if (buffer.byteLength > 2 * 1024 * 1024) {
      console.warn(`Image too large (${Math.round(buffer.byteLength / 1024)}KB), falling back to text-only`);
      return generateEmbedding(text);
    }

    const base64 = Buffer.from(buffer).toString('base64');

    const res = await fetch(
      `${GEMINI_API_URL}/${GEMINI_MULTIMODAL_EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${GEMINI_MULTIMODAL_EMBEDDING_MODEL}`,
          content: {
            parts: [
              { text: text.slice(0, 5_000) },
              { inline_data: { mime_type: contentType, data: base64 } },
            ],
          },
          outputDimensionality: EMBEDDING_DIMS,
        }),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      console.warn(`Multimodal embedding error ${res.status}: ${err.slice(0, 200)}, falling back to text-only`);
      return generateEmbedding(text);
    }

    const data = await res.json();
    const values: number[] = data?.embedding?.values;

    // Dimension guard — must match existing text embeddings
    if (!values || values.length !== EMBEDDING_DIMS) {
      console.warn(`Multimodal embedding returned ${values?.length ?? 0} dims (need ${EMBEDDING_DIMS}), falling back to text-only`);
      return generateEmbedding(text);
    }

    await logUsage({
      service: 'gemini',
      model: GEMINI_MULTIMODAL_EMBEDDING_MODEL,
      feature: 'knowledge_multimodal_embedding',
      inputTokens: Math.ceil(text.length / 4) + Math.ceil(buffer.byteLength / 1024),
      outputTokens: 0,
      totalTokens: Math.ceil(text.length / 4) + Math.ceil(buffer.byteLength / 1024),
      costUsd: 0,
    }).catch(() => {});

    return values;
  } catch (error) {
    console.warn('generateMultimodalEmbedding error, falling back to text-only:', error);
    return generateEmbedding(text);
  }
}
```

- [x] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors.

- [x] **Step 3: Commit**

```bash
git add lib/ai/embeddings.ts
git commit -m "feat(embeddings): add multimodal embedding function for Brand DNA images"
```

---

### Task 4: Brand DNA store function — create multi-node entries + links

**Files:**
- Create: `lib/brand-dna/store-nodes.ts`

This is the core of the split. Extract the storage logic from `generate.ts` into a dedicated function that creates all Brand DNA entries and links them.

- [x] **Step 1: Create `store-nodes.ts`**

```typescript
/**
 * Store Brand DNA as multiple knowledge entries linked in a hub-and-spoke graph.
 *
 * Creates: 1 brand_guideline hub + 5 category nodes + N logo nodes + N screenshot nodes
 * Links: all nodes connected to hub via client_knowledge_links
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { createKnowledgeEntry, createKnowledgeLink } from '@/lib/knowledge/queries';
import { generateEmbeddingsBatch, generateMultimodalEmbedding } from '@/lib/ai/embeddings';
import { BRAND_DNA_TYPES } from '@/lib/knowledge/types';
import type { BrandDNARawData } from './types';
import type { BrandGuidelineMetadata } from '@/lib/knowledge/types';

interface CompiledBrandDNA {
  content: string;
  metadata: BrandGuidelineMetadata;
}

interface StoredBrandDNA {
  guidelineId: string;
  totalEntries: number;
  totalLinks: number;
}

/**
 * Delete all existing Brand DNA entries for a client before regeneration.
 * Hard-delete is safe because Brand DNA is always regenerated as a complete set.
 */
async function deleteExistingBrandDNA(clientId: string): Promise<void> {
  const admin = createAdminClient();

  // Get IDs of existing Brand DNA entries
  const { data: existing } = await admin
    .from('client_knowledge_entries')
    .select('id')
    .eq('client_id', clientId)
    .in('type', BRAND_DNA_TYPES);

  if (!existing || existing.length === 0) return;

  const entryIds = existing.map((e) => e.id);

  // Delete links first (FK constraint)
  await admin
    .from('client_knowledge_links')
    .delete()
    .eq('client_id', clientId)
    .or(`source_id.in.(${entryIds.join(',')}),target_id.in.(${entryIds.join(',')})`);

  // Delete entries
  await admin
    .from('client_knowledge_entries')
    .delete()
    .eq('client_id', clientId)
    .in('type', BRAND_DNA_TYPES);
}

/**
 * Create a single link between two entries.
 */
async function linkEntries(
  clientId: string,
  sourceId: string,
  targetId: string,
  label: string,
): Promise<void> {
  try {
    await createKnowledgeLink({
      client_id: clientId,
      source_id: sourceId,
      source_type: 'entry',
      target_id: targetId,
      target_type: 'entry',
      label,
    });
  } catch (err) {
    // Duplicate link constraint — ignore
    console.warn(`Link creation skipped (${label}):`, err);
  }
}

/**
 * Store Brand DNA as a multi-node graph in client_knowledge_entries.
 */
export async function storeBrandDNANodes(
  clientId: string,
  clientName: string,
  rawData: BrandDNARawData,
  compiled: CompiledBrandDNA,
): Promise<StoredBrandDNA> {
  const meta = compiled.metadata;

  // ── 1. Hard-delete previous Brand DNA ─────────────────────────────────────
  await deleteExistingBrandDNA(clientId);

  // ── 2. Create hub node (brand_guideline) ──────────────────────────────────
  const hub = await createKnowledgeEntry({
    client_id: clientId,
    type: 'brand_guideline',
    title: `${clientName} — Brand DNA`,
    content: compiled.content,
    metadata: meta as unknown as Record<string, unknown>,
    source: 'generated',
    created_by: null,
  });

  const entryIds: string[] = [hub.id];
  const imageEntries: { id: string; url: string; text: string }[] = [];

  // ── 3. Create category nodes ──────────────────────────────────────────────

  // Visual Identity
  const visualContent = buildVisualIdentityMarkdown(meta);
  const visual = await createKnowledgeEntry({
    client_id: clientId,
    type: 'visual_identity',
    title: `Visual Identity — ${clientName}`,
    content: visualContent,
    metadata: {
      colors: meta.colors ?? [],
      fonts: meta.fonts ?? [],
      design_style: meta.design_style ?? null,
    },
    source: 'generated',
    created_by: null,
  });
  entryIds.push(visual.id);

  // Verbal Identity
  const verbalContent = buildVerbalIdentityMarkdown(meta);
  const verbal = await createKnowledgeEntry({
    client_id: clientId,
    type: 'verbal_identity',
    title: `Verbal Identity — ${clientName}`,
    content: verbalContent,
    metadata: {
      tone_primary: meta.tone_primary ?? null,
      voice_attributes: meta.voice_attributes ?? [],
      messaging_pillars: meta.messaging_pillars ?? [],
      vocabulary_patterns: meta.vocabulary_patterns ?? [],
      avoidance_patterns: meta.avoidance_patterns ?? [],
    },
    source: 'generated',
    created_by: null,
  });
  entryIds.push(verbal.id);

  // Target Audience
  const audienceContent = meta.target_audience_summary ?? 'No target audience data extracted.';
  const audience = await createKnowledgeEntry({
    client_id: clientId,
    type: 'target_audience',
    title: `Target Audience — ${clientName}`,
    content: audienceContent,
    metadata: { summary: meta.target_audience_summary ?? '' },
    source: 'generated',
    created_by: null,
  });
  entryIds.push(audience.id);

  // Competitive Positioning
  const positioningContent = meta.competitive_positioning ?? 'No competitive positioning data extracted.';
  const positioning = await createKnowledgeEntry({
    client_id: clientId,
    type: 'competitive_positioning',
    title: `Competitive Positioning — ${clientName}`,
    content: positioningContent,
    metadata: { positioning_statement: meta.competitive_positioning ?? '' },
    source: 'generated',
    created_by: null,
  });
  entryIds.push(positioning.id);

  // Product Catalog
  const productsContent = buildProductCatalogMarkdown(meta);
  const products = await createKnowledgeEntry({
    client_id: clientId,
    type: 'product_catalog',
    title: `Products & Services — ${clientName}`,
    content: productsContent,
    metadata: { products: meta.products ?? [] },
    source: 'generated',
    created_by: null,
  });
  entryIds.push(products.id);

  // ── 4. Create individual nodes (logos + screenshots) ──────────────────────

  const logoIds: string[] = [];
  for (const logo of meta.logos ?? []) {
    const logoEntry = await createKnowledgeEntry({
      client_id: clientId,
      type: 'brand_logo',
      title: `Logo (${logo.variant}) — ${clientName}`,
      content: `${logo.variant} logo variant for ${clientName}. URL: ${logo.url}`,
      metadata: { url: logo.url, variant: logo.variant },
      source: 'generated',
      created_by: null,
    });
    entryIds.push(logoEntry.id);
    logoIds.push(logoEntry.id);
    imageEntries.push({ id: logoEntry.id, url: logo.url, text: `${logo.variant} logo for ${clientName}` });
  }

  const screenshotIds: string[] = [];
  for (const ss of meta.screenshots ?? []) {
    const ssEntry = await createKnowledgeEntry({
      client_id: clientId,
      type: 'brand_screenshot',
      title: `Screenshot: ${ss.page} — ${clientName}`,
      content: `Website screenshot of ${ss.page}. ${ss.description}`,
      metadata: { url: ss.url, page: ss.page, source_url: ss.url },
      source: 'generated',
      created_by: null,
    });
    entryIds.push(ssEntry.id);
    screenshotIds.push(ssEntry.id);
    imageEntries.push({ id: ssEntry.id, url: ss.url, text: `${ss.page} page screenshot: ${ss.description}` });
  }

  // ── 5. Create links ──────────────────────────────────────────────────────

  let linkCount = 0;

  // Hub → category nodes
  for (const catId of [visual.id, verbal.id, audience.id, positioning.id, products.id]) {
    await linkEntries(clientId, hub.id, catId, 'component');
    linkCount++;
  }

  // Hub → individual nodes
  for (const logoId of logoIds) {
    await linkEntries(clientId, hub.id, logoId, 'asset');
    linkCount++;
  }
  for (const ssId of screenshotIds) {
    await linkEntries(clientId, hub.id, ssId, 'asset');
    linkCount++;
  }

  // Visual identity → logos + screenshots
  for (const logoId of logoIds) {
    await linkEntries(clientId, visual.id, logoId, 'illustrates');
    linkCount++;
  }
  for (const ssId of screenshotIds) {
    await linkEntries(clientId, visual.id, ssId, 'illustrates');
    linkCount++;
  }

  // ── 6. Embed all entries ──────────────────────────────────────────────────

  // Text entries — batch embed
  const textEntries = entryIds.filter(
    (id) => !imageEntries.some((ie) => ie.id === id),
  );
  const admin = createAdminClient();

  if (textEntries.length > 0) {
    // Fetch content for text entries
    const { data: textData } = await admin
      .from('client_knowledge_entries')
      .select('id, title, content')
      .in('id', textEntries);

    if (textData && textData.length > 0) {
      const texts = textData.map((e) => `${e.title}\n\n${(e.content ?? '').slice(0, 2000)}`);
      const embeddings = await generateEmbeddingsBatch(texts);

      for (let i = 0; i < textData.length; i++) {
        if (embeddings[i]) {
          await admin
            .from('client_knowledge_entries')
            .update({ embedding: JSON.stringify(embeddings[i]) })
            .eq('id', textData[i].id);
        }
      }
    }
  }

  // Image entries — sequential multimodal embed with rate limiting
  for (const img of imageEntries) {
    const embedding = await generateMultimodalEmbedding(img.text, img.url);
    if (embedding) {
      await admin
        .from('client_knowledge_entries')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', img.id);
    }
    // Rate limit: 200ms between multimodal calls
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return {
    guidelineId: hub.id,
    totalEntries: entryIds.length,
    totalLinks: linkCount,
  };
}

// ── Markdown builders ─────────────────────────────────────────────────────────

function buildVisualIdentityMarkdown(meta: BrandGuidelineMetadata): string {
  const sections: string[] = ['# Visual Identity\n'];

  if (meta.colors?.length) {
    sections.push('## Color Palette');
    for (const c of meta.colors) {
      sections.push(`- **${c.name}** \`${c.hex}\` — ${c.role}`);
    }
  }

  if (meta.fonts?.length) {
    sections.push('\n## Typography');
    for (const f of meta.fonts) {
      sections.push(`- **${f.family}** — ${f.role}${f.weight ? ` (${f.weight})` : ''}`);
    }
  }

  if (meta.design_style) {
    const ds = meta.design_style;
    sections.push('\n## Design Style');
    sections.push(`- **Theme:** ${ds.theme}`);
    sections.push(`- **Corners:** ${ds.corners}`);
    sections.push(`- **Density:** ${ds.density}`);
    sections.push(`- **Imagery:** ${ds.imagery}`);
  }

  return sections.join('\n');
}

function buildVerbalIdentityMarkdown(meta: BrandGuidelineMetadata): string {
  const sections: string[] = ['# Verbal Identity\n'];

  if (meta.tone_primary) sections.push(`**Primary Tone:** ${meta.tone_primary}\n`);

  if (meta.voice_attributes?.length) {
    sections.push('## Voice Attributes');
    sections.push(meta.voice_attributes.map((v) => `- ${v}`).join('\n'));
  }

  if (meta.messaging_pillars?.length) {
    sections.push('\n## Messaging Pillars');
    sections.push(meta.messaging_pillars.map((p) => `- ${p}`).join('\n'));
  }

  if (meta.vocabulary_patterns?.length) {
    sections.push('\n## Vocabulary Patterns');
    sections.push(meta.vocabulary_patterns.map((v) => `- ${v}`).join('\n'));
  }

  if (meta.avoidance_patterns?.length) {
    sections.push('\n## Avoidance Patterns');
    sections.push(meta.avoidance_patterns.map((a) => `- ~~${a}~~`).join('\n'));
  }

  return sections.join('\n');
}

function buildProductCatalogMarkdown(meta: BrandGuidelineMetadata): string {
  const sections: string[] = ['# Products & Services\n'];

  if (!meta.products?.length) {
    sections.push('No products or services extracted.');
    return sections.join('\n');
  }

  // Group by category
  const byCategory = new Map<string, typeof meta.products>();
  for (const p of meta.products) {
    const cat = p.category ?? 'General';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(p);
  }

  for (const [category, items] of byCategory) {
    sections.push(`## ${category}`);
    for (const p of items) {
      sections.push(`- **${p.name}:** ${p.description}${p.price ? ` — ${p.price}` : ''}`);
    }
    sections.push('');
  }

  return sections.join('\n');
}
```

- [x] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors.

- [x] **Step 3: Commit**

```bash
git add lib/brand-dna/store-nodes.ts
git commit -m "feat(brand-dna): add multi-node storage with hub-and-spoke linking"
```

---

### Task 5: Update `generate.ts` to use multi-node storage

**Files:**
- Modify: `lib/brand-dna/generate.ts:104-182` (replace steps 6-7 with `storeBrandDNANodes`)

- [x] **Step 1: Replace storage logic in generate.ts**

Replace lines 104-182 (everything from "Step 6: Supersede" through "Sync to knowledge_nodes") with:

```typescript
    // Step 6: Store as multi-node graph (replaces old single-entry creation)
    const { storeBrandDNANodes } = await import('./store-nodes');
    const stored = await storeBrandDNANodes(clientId, clientName, rawData, compiled);

    // Update client fields from extraction (backfill)
    const updateFields: Record<string, unknown> = {
      brand_dna_status: 'draft',
    };
    if (verbalIdentity?.tonePrimary) updateFields.brand_voice = verbalIdentity.tonePrimary;
    if (verbalIdentity?.targetAudienceSummary) updateFields.target_audience = verbalIdentity.targetAudienceSummary;
    if (colors.length > 0 || fonts.length > 0 || verbalIdentity) {
      const prefs: Record<string, unknown> = {};
      if (verbalIdentity?.voiceAttributes.length) prefs.tone_keywords = verbalIdentity.voiceAttributes;
      if (verbalIdentity?.messagingPillars.length) prefs.topics_lean_into = verbalIdentity.messagingPillars;
      if (verbalIdentity?.avoidancePatterns.length) prefs.topics_avoid = verbalIdentity.avoidancePatterns;
      if (Object.keys(prefs).length > 0) updateFields.preferences = prefs;
    }

    await admin
      .from('clients')
      .update(updateFields)
      .eq('id', clientId);

    // Invalidate cached brand context
    invalidateBrandContext(clientId);

    // Sync hub to agency knowledge graph (non-fatal)
    try {
      await syncBrandDNAToKnowledgeGraph(clientId, clientName, compiled, websiteUrl);
    } catch (syncErr) {
      console.error('Brand DNA → Knowledge Graph sync failed (non-fatal):', syncErr);
    }

    await onProgress('completed', 100, 'Brand DNA complete');

    return stored.guidelineId;
```

Also remove the now-unused import of `createKnowledgeEntry` from the top of the file (line 2) since storage is delegated to `store-nodes.ts`.

- [x] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors.

- [x] **Step 3: Commit**

```bash
git add lib/brand-dna/generate.ts
git commit -m "feat(brand-dna): wire generate.ts to multi-node storage"
```

---

### Task 6: Graph API — add type mappings + query `client_knowledge_links` for edges

**Files:**
- Modify: `app/api/knowledge/graph/route.ts:121-131` (typeToKind map)
- Modify: `app/api/knowledge/graph/route.ts:170` (add client_knowledge_links query)

- [x] **Step 1: Add new type-to-kind mappings**

In `app/api/knowledge/graph/route.ts`, replace the `typeToKind` object (lines 121-130) with:

```typescript
      const typeToKind: Record<string, string> = {
        web_page: 'web-page',
        brand_profile: 'brand-profile',
        brand_guideline: 'brand-guideline',
        meeting_note: 'meeting',
        note: 'asset',
        document: 'asset',
        idea: 'insight',
        brand_asset: 'asset',
        // Brand DNA sub-types
        visual_identity: 'visual-identity',
        verbal_identity: 'verbal-identity',
        target_audience: 'target-audience',
        competitive_positioning: 'competitive-positioning',
        product_catalog: 'product-catalog',
        brand_logo: 'brand-logo',
        brand_screenshot: 'brand-screenshot',
      };
```

- [x] **Step 2: Add `client_knowledge_links` query for edges**

After the existing client entries loop (after line ~170, just before the `return NextResponse.json`), add:

```typescript
    // ── Fetch client_knowledge_links for edges between CKE nodes ────────────

    if (isClientQuery) {
      const { data: clientLinks } = await admin
        .from('client_knowledge_links')
        .select('source_id, target_id, label')
        .eq('client_id', clientIdParam);

      for (const link of clientLinks ?? []) {
        const sourceId = `cke:${link.source_id}`;
        const targetId = `cke:${link.target_id}`;
        const edgeKey = [sourceId, targetId].sort().join('::');
        if (!seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey);
          edges.push({ source: sourceId, target: targetId });
        }
      }
    }
```

- [x] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors.

- [x] **Step 4: Commit**

```bash
git add app/api/knowledge/graph/route.ts
git commit -m "feat(graph-api): add Brand DNA type mappings + query client_knowledge_links for edges"
```

---

### Task 7: Graph renderer — add colors for new node kinds

**Files:**
- Modify: `app/admin/knowledge/agency-knowledge-graph.tsx:100-111` (TYPE_COLORS map)

- [x] **Step 1: Add new kind colors**

In `app/admin/knowledge/agency-knowledge-graph.tsx`, replace the `TYPE_COLORS` object (lines 100-111) with:

```typescript
const TYPE_COLORS: Record<string, string> = {
  domain: '#f59e0b',           // Gold — top-level navigation
  playbook: '#38bdf8',         // Blue — consolidated knowledge
  client: '#22c55e',           // Green — client source of truth
  meeting: '#a78bfa',          // Purple — meeting notes
  asset: '#64748b',            // Slate — docs, templates, projects
  insight: '#f472b6',          // Pink — industry insights
  // Brand DNA types (from client_knowledge_entries)
  'web-page': '#06b6d4',      // Cyan — scraped website pages
  'brand-profile': '#f59e0b', // Gold — brand profile
  'brand-guideline': '#eab308', // Yellow — brand DNA guideline
  // Brand DNA sub-types
  'visual-identity': '#06b6d4',   // Cyan
  'verbal-identity': '#f97316',   // Orange
  'brand-logo': '#eab308',        // Gold
  'brand-screenshot': '#14b8a6',  // Teal
  'product-catalog': '#22c55e',   // Green
  'target-audience': '#ec4899',   // Pink
  'competitive-positioning': '#ef4444', // Red
};
```

- [x] **Step 2: Commit**

```bash
git add app/admin/knowledge/agency-knowledge-graph.tsx
git commit -m "feat(graph-ui): add colors for Brand DNA sub-node kinds"
```

---

### Task 8: Verify end-to-end — build + type check

**Files:** None (verification only)

- [x] **Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [x] **Step 2: Build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [x] **Step 3: Lint**

Run: `npm run lint`
Expected: No new lint errors.

- [x] **Step 4: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: resolve any build/lint issues from Brand DNA multi-node split"
```
