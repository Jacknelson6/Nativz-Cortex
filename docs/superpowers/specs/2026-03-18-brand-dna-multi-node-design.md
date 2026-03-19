# Brand DNA Multi-Node Split — Design Spec

> **Date:** 2026-03-18
> **Status:** Approved
> **Scope:** Break the monolithic `brand_guideline` entry into a hub-and-spoke graph of typed knowledge entries with multimodal embeddings

---

## Problem

Brand DNA generation currently produces **one `brand_guideline` entry** in `client_knowledge_entries` with all brand data (colors, fonts, logos, screenshots, tone, products, audience, positioning) crammed into a single row. This means:

- The client knowledge graph shows one fat node instead of a rich, navigable brand graph
- Individual brand elements (logos, screenshots) aren't independently searchable or linkable
- Visual assets can't be embedded alongside text for multimodal semantic search
- The portal shows a wall of text instead of structured brand sections

## Solution

Split Brand DNA into a **hybrid node structure**: category nodes for structured data bundles, individual nodes for discrete visual assets. All nodes live in `client_knowledge_entries` (the client-tier knowledge graph) and link back to a hub `brand_guideline` entry.

---

## Node Types

### Category Nodes (1 each per client)

| Type | Content (markdown) | Metadata (JSONB) |
|---|---|---|
| `brand_guideline` | Overall brand overview + strategy | Full `BrandGuidelineMetadata` (kept fat for backward compat — sub-entries duplicate relevant slices) |
| `visual_identity` | Color palette, typography stack, design philosophy | `{ colors: BrandColor[], fonts: BrandFont[], design_style: DesignStyle }` |
| `verbal_identity` | Tone description, voice characteristics, messaging pillars, vocabulary guide | `{ tone_primary: string, voice_attributes: string[], messaging_pillars: string[], vocabulary_patterns: string[], avoidance_patterns: string[] }` |
| `target_audience` | Audience profile narrative | `{ summary: string }` |
| `competitive_positioning` | Differentiation narrative, USPs | `{ positioning_statement: string }` |
| `product_catalog` | Categorized product/service listing with descriptions | `{ products: ProductItem[] }` |

### Individual Nodes (N each per client)

| Type | One Per | Content | Metadata |
|---|---|---|---|
| `brand_logo` | Logo variant | Alt text + description of the logo | `{ url: string, variant: 'primary' \| 'dark' \| 'light' \| 'icon', format?: string }` |
| `brand_screenshot` | Captured website page | Page description + design observations | `{ url: string, page: string, source_url: string }` |

### Expected Node Count

A typical client with 3 logos, 6 screenshots, and 12 products produces:
- 6 category nodes + 9 individual nodes = **15 entries**
- Plus 14+ links between them

---

## Linking Strategy

All links use `client_knowledge_links` with `label` indicating the relationship.

```
brand_guideline ←→ visual_identity       (label: 'component')
brand_guideline ←→ verbal_identity       (label: 'component')
brand_guideline ←→ target_audience       (label: 'component')
brand_guideline ←→ competitive_positioning (label: 'component')
brand_guideline ←→ product_catalog       (label: 'component')
brand_guideline ←→ brand_logo (x N)      (label: 'asset')
brand_guideline ←→ brand_screenshot (x N) (label: 'asset')
visual_identity ←→ brand_logo (x N)      (label: 'illustrates')
visual_identity ←→ brand_screenshot (x N) (label: 'illustrates')
```

All links use `source_type: 'entry'` and `target_type: 'entry'`.

---

## Embedding Strategy

### Text Nodes
Category nodes (`visual_identity`, `verbal_identity`, `target_audience`, `competitive_positioning`, `product_catalog`) and the hub `brand_guideline` are embedded via the existing `generateEmbedding()` function using `gemini-embedding-001`. Input: `title + content` (first 2000 chars).

### Image Nodes (Multimodal)
`brand_logo` and `brand_screenshot` entries are embedded via a new `generateMultimodalEmbedding(text, imageUrl)` function using **Gemini Embedding 002** (`gemini-embedding-exp-03-07` or latest multimodal embedding model). This sends both the image bytes and text description as parts, producing a single 768-dimensional vector that captures both visual and semantic meaning.

This enables searches like:
- "minimalist dark logo" → finds matching logo variants
- "hero section with gradient" → finds matching screenshots
- "brand colors in action" → finds screenshots showing the palette

### New Function

```typescript
// lib/ai/embeddings.ts
export async function generateMultimodalEmbedding(
  text: string,
  imageUrl: string,
): Promise<number[] | null>
```

Fetches the image (resized to max 512px to stay under serverless payload limits), sends `{ parts: [{ text }, { inline_data: { mime_type, data: base64 } }] }` to the Gemini embedding API. Falls back to text-only embedding if image fetch fails.

**Dimensionality:** Must output 768 dimensions (matching `gemini-embedding-001`) so vectors are comparable in the same `embedding` column. If the multimodal model outputs a different dimensionality, fall back to text-only embedding and log a warning.

**Rate limiting:** Sequential calls with 200ms delay between each to respect Gemini free-tier limits.

### Batch Embedding

After all Brand DNA entries are created, embed them in one batch:
1. Collect all text-only entries → `generateEmbeddingsBatch()`
2. Collect all image entries → `generateMultimodalEmbedding()` individually with sequential delay (multimodal can't batch)

---

## Database Migration (041)

### Widen `client_knowledge_entries.type` CHECK constraint

```sql
-- Drop and recreate the CHECK constraint to include new Brand DNA types
ALTER TABLE client_knowledge_entries DROP CONSTRAINT IF EXISTS client_knowledge_entries_type_check;
ALTER TABLE client_knowledge_entries ADD CONSTRAINT client_knowledge_entries_type_check
  CHECK (type IN (
    -- Existing types
    'brand_asset', 'brand_profile', 'brand_guideline', 'document',
    'web_page', 'note', 'idea', 'meeting_note',
    -- New Brand DNA types
    'visual_identity', 'verbal_identity', 'target_audience',
    'competitive_positioning', 'product_catalog',
    'brand_logo', 'brand_screenshot'
  ));
```

Ensure the `embedding` column exists (it may already exist from an untracked migration — add `IF NOT EXISTS` guard):

```sql
-- Ensure embedding column exists for semantic search
ALTER TABLE client_knowledge_entries ADD COLUMN IF NOT EXISTS embedding vector(768);
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_embedding
  ON client_knowledge_entries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

No new tables. No schema changes to `client_knowledge_links` or `brand_dna_jobs`.

---

## TypeScript Type Changes

### `lib/knowledge/types.ts`

Update `KnowledgeEntryType`:

```typescript
export type KnowledgeEntryType =
  | 'brand_asset' | 'brand_profile' | 'brand_guideline'
  | 'document' | 'web_page' | 'note' | 'idea' | 'meeting_note'
  // Brand DNA sub-types
  | 'visual_identity' | 'verbal_identity' | 'target_audience'
  | 'competitive_positioning' | 'product_catalog'
  | 'brand_logo' | 'brand_screenshot';
```

Add per-node metadata interfaces:

```typescript
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

export interface TargetAudienceMetadata {
  summary: string;
}

export interface CompetitivePositioningMetadata {
  positioning_statement: string;
}

export interface ProductCatalogMetadata {
  products: ProductItem[];
}
```

---

## Generation Flow Changes

### Current Flow (in `lib/brand-dna/generate.ts`)

1. Crawl website → extract visuals → analyze verbal → extract products → compile → store ONE `brand_guideline` entry → sync ONE `client` node to agency graph

### Updated Flow

Steps 1-5 (crawl, extract, analyze, compile) remain identical. Step 6 (store) changes:

#### 6a. Supersede Previous Brand DNA

Find all entries for this client with types in the Brand DNA set (`brand_guideline`, `visual_identity`, `verbal_identity`, `target_audience`, `competitive_positioning`, `product_catalog`, `brand_logo`, `brand_screenshot`). **Hard-delete** them and their associated `client_knowledge_links`. Superseded entries should not linger in semantic search results — a clean replacement is simpler and safer than soft-delete with metadata markers.

This is safe because Brand DNA is always regenerated as a complete set — partial updates don't happen.

#### 6b. Create Hub Node

Create `brand_guideline` entry with overview content and summary metadata (same as today, but with `generated_from` URLs and `version` number).

#### 6c. Create Category Nodes

Create entries for: `visual_identity`, `verbal_identity`, `target_audience`, `competitive_positioning`, `product_catalog`. Each gets:
- `client_id`: the client
- `type`: the specific type
- `title`: e.g., "Visual Identity — {Client Name}"
- `content`: focused markdown section
- `metadata`: relevant structured data slice
- `source`: `'generated'`

#### 6d. Create Individual Nodes

For each logo variant → create `brand_logo` entry.
For each screenshot → create `brand_screenshot` entry.

#### 6e. Create Links

Insert `client_knowledge_links` rows connecting all nodes per the linking strategy above.

#### 6f. Embed All

Batch embed text entries. Individually embed image entries with multimodal embeddings.

#### 6g. Sync Hub to Agency Graph

Same as today — `syncBrandDNAToKnowledgeGraph()` creates/updates a `knowledge_nodes` record with `kind: 'client'`. Only the hub summary goes to the agency graph; the detailed nodes stay in the client knowledge graph.

---

## Graph Renderer Changes

### `app/api/knowledge/graph/route.ts`

The route already maps `client_knowledge_entries` types to graph kinds via `typeToKind`. Add new mappings:

```typescript
const typeToKind: Record<string, string> = {
  // Existing
  web_page: 'web-page',
  brand_profile: 'brand-profile',
  brand_guideline: 'brand-guideline',
  meeting_note: 'meeting',
  note: 'asset',
  document: 'asset',
  idea: 'insight',
  brand_asset: 'asset',
  // New Brand DNA types
  visual_identity: 'visual-identity',
  verbal_identity: 'verbal-identity',
  target_audience: 'target-audience',
  competitive_positioning: 'competitive-positioning',
  product_catalog: 'product-catalog',
  brand_logo: 'brand-logo',
  brand_screenshot: 'brand-screenshot',
};
```

### Graph route: query `client_knowledge_links` for edges

The graph route currently only derives edges from `knowledge_nodes.connections` arrays and hardcoded parent-child logic. It does **not** query `client_knowledge_links`. Update the route to also fetch `client_knowledge_links` for the selected client and include them as edges. This makes the linking strategy (component, asset, illustrates labels) visible in the rendered graph.

```typescript
// When client_id is specified, also fetch client_knowledge_links
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

### `app/admin/knowledge/agency-knowledge-graph.tsx`

Add colors for new kinds in the Sigma.js renderer:

| Kind | Color |
|---|---|
| `visual-identity` | cyan (`#06b6d4`) |
| `verbal-identity` | orange (`#f97316`) |
| `brand-logo` | gold (`#eab308`) |
| `brand-screenshot` | teal (`#14b8a6`) |
| `product-catalog` | green (`#22c55e`) |
| `target-audience` | pink (`#ec4899`) |
| `competitive-positioning` | red (`#ef4444`) |

---

## Portal Impact

All new entries live in `client_knowledge_entries` → the portal's existing knowledge view queries this table → new types appear in the list automatically.

**UX consideration:** The portal knowledge page will now show ~15 Brand DNA entries instead of 1. The existing type filter UI handles this (clients can filter by type). However, a future iteration should consider grouping Brand DNA entries under a collapsible section or linking them from the Brand DNA portal page (`/portal/brand`). This is out of scope for this spec — the immediate goal is data architecture, not portal UX polish.

---

## Brand Context Bridge

`lib/knowledge/brand-context.ts` (`getBrandContext()`) currently reads the single `brand_guideline` entry and pulls structured data from its fat `BrandGuidelineMetadata`.

**Decision: Hub keeps the fat metadata.** The `brand_guideline` entry retains the full `BrandGuidelineMetadata` shape (colors, fonts, logos, etc.). Sub-entries duplicate relevant slices into their own metadata. This means:

- `getBrandContext()` continues to work unchanged — it reads from the hub
- No breaking change for existing clients generated before the split
- Sub-entries are for graph traversal, search, and portal display — not for `getBrandContext()`
- Future optimization: `getBrandContext()` could read from sub-entries for richer data, but this is not required in this iteration

Cache invalidation (`invalidateBrandContext()`) remains the same — keyed by `clientId`.

---

## Files to Modify

| File | Change |
|---|---|
| `supabase/migrations/041_brand_dna_multi_node.sql` | New migration: widen type CHECK, ensure embedding column + index |
| `lib/knowledge/types.ts` | Add new entry types + all metadata interfaces |
| `lib/ai/embeddings.ts` | Add `generateMultimodalEmbedding()` with image resize + 768-dim guard |
| `lib/brand-dna/generate.ts` | Split store step into multi-node creation with hard-delete of old entries |
| `lib/brand-dna/sync-to-graph.ts` | Keep hub sync, no change to agency graph |
| `lib/knowledge/queries.ts` | Update `getKnowledgeGraph()` domain matching for new types |
| `app/api/knowledge/graph/route.ts` | Add `typeToKind` mappings + query `client_knowledge_links` for edges |
| `app/admin/knowledge/agency-knowledge-graph.tsx` | Add colors for new kinds |

## Files NOT Modified

- Portal pages — they query `client_knowledge_entries` generically, new types appear automatically
- `brand_dna_jobs` — job tracking unchanged
- `knowledge_nodes` / agency graph — only the hub syncs, no structural change
- `lib/knowledge/brand-context.ts` — hub keeps fat metadata, `getBrandContext()` unchanged
- Brand DNA admin UI (`components/brand-dna/`) — reads from `brand_guideline` hub, sub-entries are graph-level detail
