# PRD: Knowledge Base Architecture Rebuild

**Status:** Draft
**Author:** Atlas (AI co-pilot)
**Date:** March 31, 2026
**Target:** Nativz Cortex — internal dogfood for MemoraAI

---

## 1. Problem Statement

The current knowledge base is a collection of features built incrementally without a unified information architecture:

- **16 overlapping entry types** (`brand_asset`, `brand_profile`, `brand_guideline`, etc.) with no clear boundaries
- **One link label** (`related_to`) that tells you nothing about WHY things are connected
- **No temporal awareness** — a brand guideline from 6 months ago is treated identically to one from yesterday
- **Blob storage** — meeting notes go in as raw markdown; decisions, action items, and entities are not extracted as first-class nodes
- **Weak entity linking** — name-matching only, no relationship semantics
- **No query intelligence** — vector search or FTS, nothing that can answer "what decisions have we made about X in the last 3 months?"

The result: it looks like a graph but doesn't think like one. Data goes in, but knowledge doesn't come out.

## 2. Design Principles

1. **Ontology-first.** Define what exists, how things relate, and what makes each type useful BEFORE writing code.
2. **Decompose on ingest.** A meeting note is a source document. The decisions, action items, and entities mentioned are separate knowledge nodes extracted from it.
3. **Relationships are first-class.** Every link must have a typed label that explains WHY two things are connected.
4. **Time is a dimension.** Every fact has a validity window. Supersession chains track how knowledge evolves.
5. **Query by intent.** The system should understand what kind of question is being asked and route to the right retrieval strategy.
6. **Per-client isolation.** Each client gets their own Supabase instance (MemoraAI architecture). For now, Nativz is the dogfood instance on the existing Cortex Supabase.

## 3. Information Architecture

### 3.1 Node Types (Ontology)

Replace the current 16 fuzzy `KnowledgeEntryType` values with a clean, well-defined set:

| Node Type | Description | Required Fields | Source |
|-----------|-------------|-----------------|--------|
| `document` | Any uploaded or scraped document (SOPs, brand docs, strategy decks, web pages) | title, content, source_url?, document_type | Manual upload, web scrape, Drive |
| `meeting` | A meeting transcript/summary (the source artifact) | title, content, meeting_date, attendees[], duration? | Fyxer, OpenGranola, manual |
| `decision` | A specific decision made (extracted from meetings or documents) | title, content, decided_by[], valid_from, valid_until?, status | Extracted from meetings/docs |
| `action_item` | A task assigned to someone | title, owner, deadline?, status, source_meeting? | Extracted from meetings |
| `guideline` | A brand rule, voice guideline, visual standard | title, content, category, version, is_active | Brand DNA, manual |
| `person` | An internal or external person | name, role?, organization?, contact_info? | Extracted from meetings, CRM |
| `competitor` | A competitor entity | name, website?, positioning?, last_updated | Manual, extracted from meetings |
| `claim` | A specific claim about a competitor or market (temporal) | content, subject_entity, valid_from, confidence, source | Extracted from meetings/research |
| `campaign` | A marketing campaign or initiative | name, client, status, date_range, channels[] | Manual, project management |
| `product` | A client's product or service | name, description, price?, category? | Brand DNA, manual |
| `insight` | A research finding, data point, or observation | title, content, source, confidence | Topic search, research, meetings |

**Migration path:** Existing entries map to new types:
- `brand_asset`, `brand_profile`, `brand_guideline`, `visual_identity`, `verbal_identity` → `guideline` (with `category` field)
- `meeting_note` → `meeting` (plus extracted `decision` and `action_item` nodes)
- `document`, `web_page`, `note` → `document` (with `document_type` field)
- `idea` → `insight`
- `target_audience`, `competitive_positioning` → `guideline` or `competitor`
- `product_catalog` → `product` (one node per product, not one blob)
- `brand_logo`, `brand_screenshot` → `document` with `document_type: 'asset'`

### 3.2 Relationship Types

Replace the single `related_to` label with typed relationships:

| Relationship | Description | Example |
|-------------|-------------|---------|
| `PRODUCED` | A meeting/document produced a decision or action item | Meeting → Decision |
| `SUPERSEDES` | A newer fact replaces an older one | Decision (new) → Decision (old) |
| `CONTRADICTS` | Two facts conflict (neither supersedes yet) | Claim → Claim |
| `REFERENCES` | One node cites or mentions another | Document → Guideline |
| `ASSIGNED_TO` | An action item is owned by a person | ActionItem → Person |
| `BELONGS_TO` | A node belongs to a campaign, category, or parent | Product → Campaign |
| `MENTIONED_IN` | An entity was mentioned in a meeting or document | Person → Meeting |
| `ABOUT` | A node is about a specific entity | Decision → Competitor |
| `VALID_DURING` | A fact was valid during a specific period | Guideline → DateRange |
| `REPLACED_BY` | Forward pointer from old to new | Guideline (old) → Guideline (new) |

### 3.3 Temporal Model

Every node carries:
```
valid_from: timestamptz (when this became true)
valid_until: timestamptz | null (when this stopped being true, null = still active)
superseded_by: uuid | null (pointer to the node that replaced this)
confidence: float (0-1, how confident the extraction was)
temporal_markers: jsonb (raw temporal phrases detected in source text)
```

Supersession rules:
- When a new `decision` or `guideline` contradicts an existing one on the same topic, the system flags it
- If confidence > 0.8, auto-supersede (set `superseded_by` on old node, create `SUPERSEDES` link)
- If confidence 0.5-0.8, flag for human review
- Below 0.5, ignore

### 3.4 Schema Changes

#### New migration: `075_knowledge_base_rebuild.sql`

```sql
-- 1. Add temporal columns to client_knowledge_entries
ALTER TABLE client_knowledge_entries
  ADD COLUMN IF NOT EXISTS valid_from timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS valid_until timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES client_knowledge_entries(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confidence float DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS temporal_markers jsonb DEFAULT NULL;

-- 2. Update type constraint to new ontology
-- (Keep old types working during migration, add new ones)
ALTER TABLE client_knowledge_entries
  DROP CONSTRAINT IF EXISTS client_knowledge_entries_type_check;

ALTER TABLE client_knowledge_entries
  ADD CONSTRAINT client_knowledge_entries_type_check
  CHECK (type IN (
    -- New ontology
    'document', 'meeting', 'decision', 'action_item', 'guideline',
    'person', 'competitor', 'claim', 'campaign', 'product', 'insight',
    -- Legacy (kept for backward compat during migration)
    'brand_asset', 'brand_profile', 'brand_guideline', 'web_page', 'note',
    'idea', 'meeting_note', 'visual_identity', 'verbal_identity',
    'target_audience', 'competitive_positioning', 'product_catalog',
    'brand_logo', 'brand_screenshot'
  ));

-- 3. Update link label constraint
ALTER TABLE client_knowledge_links
  DROP CONSTRAINT IF EXISTS client_knowledge_links_label_check;
-- No constraint on label — allow any string, validate in application code

-- 4. Add temporal indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_temporal
  ON client_knowledge_entries(client_id, valid_from, valid_until)
  WHERE valid_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_entries_superseded
  ON client_knowledge_entries(superseded_by)
  WHERE superseded_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_entries_active
  ON client_knowledge_entries(client_id, type)
  WHERE superseded_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_links_label
  ON client_knowledge_links(label);

-- 5. RPC: Get current (non-superseded) knowledge
CREATE OR REPLACE FUNCTION get_current_knowledge(
  target_client_id uuid,
  target_types text[] DEFAULT NULL,
  result_limit int DEFAULT 50
)
RETURNS SETOF client_knowledge_entries AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM client_knowledge_entries
  WHERE client_id = target_client_id
    AND superseded_by IS NULL
    AND (valid_until IS NULL OR valid_until > now())
    AND (target_types IS NULL OR type = ANY(target_types))
  ORDER BY valid_from DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC: Get knowledge history for a topic (temporal chain)
CREATE OR REPLACE FUNCTION get_knowledge_history(
  target_client_id uuid,
  search_text text,
  result_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  type text,
  title text,
  content text,
  valid_from timestamptz,
  valid_until timestamptz,
  superseded_by uuid,
  confidence float,
  created_at timestamptz,
  is_current boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.type, e.title, e.content,
    e.valid_from, e.valid_until, e.superseded_by, e.confidence,
    e.created_at,
    (e.superseded_by IS NULL AND (e.valid_until IS NULL OR e.valid_until > now())) as is_current
  FROM client_knowledge_entries e
  WHERE e.client_id = target_client_id
    AND (
      e.title ILIKE '%' || search_text || '%'
      OR e.content ILIKE '%' || search_text || '%'
    )
  ORDER BY e.valid_from DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## 4. Ingestion Pipeline Redesign

### 4.1 Current Flow (Broken)
```
Source → raw markdown blob → client_knowledge_entries → done
         (no decomposition)   (type = whatever)
```

### 4.2 New Flow
```
Source (meeting, document, web page)
  ↓
[1] Normalize — extract text, clean formatting
  ↓
[2] Decompose — LLM extracts entities, decisions, action items as separate nodes
  ↓
[3] Temporal Stamp — detect validity windows, contradictions
  ↓
[4] Supersession Check — compare against existing graph for conflicts
  ↓
[5] Graph Write — create nodes + typed relationships
  ↓
[6] Embed — generate vector embeddings for all new nodes
```

### 4.3 Meeting Decomposition (The Big Win)

When a meeting note is ingested, the pipeline should:

1. **Create the meeting node** (type: `meeting`) with the full transcript/summary
2. **Extract decisions** → separate `decision` nodes, linked via `PRODUCED`
3. **Extract action items** → separate `action_item` nodes, linked via `PRODUCED` + `ASSIGNED_TO`
4. **Extract entity mentions** → `MENTIONED_IN` links to existing `person`, `competitor`, `product` nodes
5. **Detect temporal markers** → set `valid_from`/`valid_until` on decisions
6. **Run supersession detection** → check if any extracted decision conflicts with existing knowledge

This means a single meeting note might produce 1 `meeting` node + 3 `decision` nodes + 5 `action_item` nodes + 8 relationship links. That's the graph actually working.

### 4.4 Document Decomposition

For documents (SOPs, brand guidelines, strategy decks):

1. **Semantic chunking** — split on sections/paragraphs (200-800 tokens each), not fixed-size
2. **Entity extraction** — identify people, products, competitors mentioned
3. **Guideline extraction** — identify rules, standards, policies as separate `guideline` nodes
4. **Version tracking** — if a document replaces an older version, create `SUPERSEDES` chain

### 4.5 New Files

| File | Purpose |
|------|---------|
| `lib/knowledge/decomposer.ts` | LLM-based decomposition of meetings/documents into constituent nodes |
| `lib/knowledge/temporal-extractor.ts` | Detect temporal markers in text |
| `lib/knowledge/supersession-detector.ts` | Compare new entries against existing graph for conflicts |
| `lib/knowledge/ingestion-pipeline.ts` | Unified pipeline: normalize → decompose → timestamp → supersede → write → embed |
| `lib/knowledge/query-classifier.ts` | Classify incoming queries by intent for retrieval routing |
| `lib/knowledge/temporal-search.ts` | Temporal-aware search (filter by validity, show history) |

## 5. Query & Retrieval Redesign

### 5.1 Query Classification

Every search query gets classified before retrieval:

| Query Type | Example | Retrieval Strategy |
|-----------|---------|-------------------|
| `factual_lookup` | "What's Toastique's brand color?" | Vector search on guidelines |
| `temporal_comparison` | "How has our Kumon strategy changed?" | Graph traversal on supersession chains |
| `decision_history` | "What did we decide about Q2 campaigns?" | Filter on `decision` type + temporal range |
| `action_tracking` | "What's unresolved from last week?" | Filter on `action_item` type + status |
| `competitive_intel` | "What do we know about Competitor X?" | Entity filter on `competitor` + `claim` types |
| `summarization` | "Summarize last week's meetings" | Filter on `meeting` type + date range |
| `cross_reference` | "Connect the Kumon meeting to the social strategy doc" | Graph traversal across relationship types |
| `open_synthesis` | "What should I know before Monday's call?" | Multi-type retrieval + LLM synthesis |

### 5.2 Hybrid Retrieval

Three retrieval mechanisms, results merged:

1. **Vector search** (existing pgvector) — semantic similarity
2. **Graph traversal** — follow typed relationships from entity nodes
3. **BM25 keyword** (existing FTS) — exact phrase, proper nouns

Add cross-encoder reranking (BGE-reranker or Cohere) to merge results from all three.

### 5.3 Citation Enforcement

Every answer from the Nerd (or future Slack bot) must include:
- Source citations (meeting date, document title, specific quote)
- Temporal validity ("as of March 15; no updates since")
- Confidence indicator

## 6. UI Changes

### 6.1 Knowledge Graph View (Existing — Upgrade)

- **Color-code by node type** (decisions = blue, guidelines = green, meetings = gray, etc.)
- **Show temporal chains** — when viewing a superseded node, show the chain of versions
- **Filter by type** — toggle node types on/off
- **Filter by time** — slider to show knowledge "as of" a specific date
- **Relationship labels visible** on edges

### 6.2 Knowledge Feed (New)

A chronological feed of knowledge changes:
- "3 decisions extracted from Toastique weekly meeting"
- "Brand guideline updated — supersedes version from Jan 15"
- "New competitor claim detected about X"
- "2 action items overdue from last week's meetings"

### 6.3 Knowledge Health Dashboard (New)

- Total nodes by type
- Ingestion pipeline status (last sync per source)
- Supersession activity (how many facts have been updated)
- Stale knowledge alerts (guidelines older than 90 days with no review)
- Action item status summary

## 7. Implementation Plan

### Phase 1: Schema & Temporal Layer (Week 1-2)
- [ ] Migration `075_knowledge_base_rebuild.sql`
- [ ] Update `lib/knowledge/types.ts` with new ontology
- [ ] Build `temporal-extractor.ts`
- [ ] Build `supersession-detector.ts`
- [ ] Wire temporal fields into existing `createKnowledgeEntry()`
- [ ] Add `searchCurrentKnowledge()` to `search.ts`
- [ ] Migrate existing entries to new type mapping (backward-compatible)

### Phase 2: Ingestion Pipeline (Week 2-3)
- [ ] Build `decomposer.ts` — meeting decomposition (decisions + action items)
- [ ] Build `ingestion-pipeline.ts` — unified pipeline
- [ ] Upgrade Fyxer importer to use new pipeline (fix email sync first)
- [ ] Add semantic chunking for document ingestion
- [ ] Build typed relationship creation (replace `related_to` with proper labels)
- [ ] Re-ingest existing meeting notes through new pipeline (extract decisions/actions)

### Phase 3: Query & Retrieval (Week 3-4)
- [ ] Build `query-classifier.ts`
- [ ] Add BM25 + cross-encoder reranking to search
- [ ] Build temporal search (history, as-of-date queries)
- [ ] Upgrade Nerd chat to use query classification + citation enforcement
- [ ] Build parameterized query templates for each query type

### Phase 4: UI & Polish (Week 4)
- [ ] Upgrade graph view (color coding, type filters, temporal chains)
- [ ] Build knowledge feed component
- [ ] Build knowledge health dashboard
- [ ] Add "decompose this meeting" button for manual re-processing
- [ ] Add relationship label display on graph edges

## 8. Success Metrics

- **Decomposition coverage:** >80% of meetings produce at least 1 decision or action item node
- **Temporal chain depth:** Average supersession chain length > 1.5 for guidelines
- **Query accuracy:** >90% of classified queries route to the correct retrieval strategy
- **Citation rate:** 100% of Nerd responses include at least one source citation
- **Stale knowledge:** <10% of guidelines older than 90 days without review flag

## 9. What NOT to Build (Yet)

- Multi-agent reflection loops for query answering
- Real-time webhook ingestion from external sources
- Custom LLM fine-tuning for entity extraction
- Google Drive / Slack / CRM connectors (defer to MemoraAI expansion)
- Per-client Supabase provisioning (design for it, don't build it yet)
- Mobile app or Slack bot (the Nerd IS the interface for now)

## 10. Data Migration Strategy

The rebuild must not break existing functionality. Migration approach:

1. **Add new columns** (temporal fields) — backward compatible, defaults handle old data
2. **Expand type constraint** — allow both old and new types
3. **Run migration script** — map old types to new types, set `valid_from` from `created_at`
4. **Re-ingest meetings** — run existing 40 meeting notes through the new decomposition pipeline
5. **Deprecate old types** — after migration verified, remove legacy types from the constraint
6. **Update UI** — graph view, node cards, and forms use new ontology

The migration script should be idempotent and reversible.
