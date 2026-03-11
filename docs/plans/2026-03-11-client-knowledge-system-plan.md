# Client Knowledge System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a per-client knowledge system with entries, links, graph visualization, web scraping, brand profile generation, idea generator, and integrations with the Nerd, topic searches, and moodboards.

**Architecture:** Two Supabase tables (entries + links) with polymorphic references to existing tables. ReactFlow graph renderer. Cloudflare BR Crawl for web scraping. Claude for brand profile and idea generation. Obsidian vault sync with wiki-links.

**Tech Stack:** Next.js 15, Supabase, ReactFlow, dagre, Cloudflare Browser Rendering API, Claude via OpenRouter, Zod, @mozilla/readability

**Design Doc:** `docs/plans/2026-03-11-client-knowledge-system-design.md`

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/038_create_knowledge_tables.sql`

**Step 1: Write the migration**

```sql
-- Client knowledge entries
CREATE TABLE IF NOT EXISTS client_knowledge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('brand_asset', 'brand_profile', 'document', 'web_page', 'note', 'idea')),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  metadata jsonb DEFAULT '{}',
  source text NOT NULL CHECK (source IN ('manual', 'scraped', 'generated', 'imported')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Client knowledge links (edges between nodes)
CREATE TABLE IF NOT EXISTS client_knowledge_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  source_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('entry', 'contact', 'search', 'strategy', 'idea_submission')),
  target_id uuid NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('entry', 'contact', 'search', 'strategy', 'idea_submission')),
  label text NOT NULL DEFAULT 'related_to',
  created_at timestamptz DEFAULT now(),
  UNIQUE(source_id, source_type, target_id, target_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_client ON client_knowledge_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_type ON client_knowledge_entries(client_id, type);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_client ON client_knowledge_links(client_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_source ON client_knowledge_links(source_id, source_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_target ON client_knowledge_links(target_id, target_type);

-- RLS
ALTER TABLE client_knowledge_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_knowledge_links ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "admin_knowledge_entries" ON client_knowledge_entries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admin_knowledge_links" ON client_knowledge_links
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Portal read-only (scoped by organization)
CREATE POLICY "portal_knowledge_entries_read" ON client_knowledge_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients c
      JOIN organizations o ON o.id = c.organization_id
      JOIN users u ON u.organization_id = o.id
      WHERE c.id = client_knowledge_entries.client_id
      AND u.id = auth.uid()
    )
  );

CREATE POLICY "portal_knowledge_links_read" ON client_knowledge_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients c
      JOIN organizations o ON o.id = c.organization_id
      JOIN users u ON u.organization_id = o.id
      WHERE c.id = client_knowledge_links.client_id
      AND u.id = auth.uid()
    )
  );
```

**Step 2: Apply the migration**

Run: `npx supabase db push` or apply via the Supabase MCP tool `apply_migration`.

**Step 3: Commit**

```bash
git add supabase/migrations/038_create_knowledge_tables.sql
git commit -m "feat: add knowledge entries and links tables (migration 038)"
```

---

## Task 2: TypeScript Types & Shared Utilities

**Files:**
- Modify: `lib/types/database.ts` (add new interfaces after existing types ~line 100+)
- Create: `lib/knowledge/types.ts`
- Create: `lib/knowledge/queries.ts`

**Step 1: Add types**

In `lib/knowledge/types.ts`:

```typescript
export type KnowledgeEntryType = 'brand_asset' | 'brand_profile' | 'document' | 'web_page' | 'note' | 'idea';
export type KnowledgeSource = 'manual' | 'scraped' | 'generated' | 'imported';
export type KnowledgeNodeType = 'entry' | 'contact' | 'search' | 'strategy' | 'idea_submission';

export interface KnowledgeEntry {
  id: string;
  client_id: string;
  type: KnowledgeEntryType;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  source: KnowledgeSource;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface KnowledgeLink {
  id: string;
  client_id: string;
  source_id: string;
  source_type: KnowledgeNodeType;
  target_id: string;
  target_type: KnowledgeNodeType;
  label: string;
  created_at: string;
}

export interface KnowledgeGraphData {
  entries: KnowledgeEntry[];
  links: KnowledgeLink[];
  externalNodes: ExternalNode[];
}

export interface ExternalNode {
  id: string;
  type: KnowledgeNodeType;
  title: string;
  subtitle: string;
  created_at: string;
}

// Metadata shapes per entry type
export interface BrandAssetMetadata {
  colors?: string[];
  fonts?: string[];
  file_url?: string;
  asset_type?: 'logo' | 'color_palette' | 'font' | 'style_guide' | 'other';
}

export interface WebPageMetadata {
  source_url: string;
  scraped_at: string;
  depth: number;
  word_count: number;
  status?: 'processing' | 'completed' | 'failed';
}

export interface BrandProfileMetadata {
  generated_from: string[];
  superseded_by?: string;
  colors?: string[];
  fonts?: string[];
}

export interface IdeaMetadata {
  format?: 'short_form' | 'long_form' | 'reel' | 'story';
  content_pillar?: string;
  concept_input?: string;
}
```

**Step 2: Add query helpers**

In `lib/knowledge/queries.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin';
import type { KnowledgeEntry, KnowledgeLink, KnowledgeGraphData, ExternalNode, KnowledgeEntryType } from './types';

export async function getKnowledgeEntries(clientId: string, type?: KnowledgeEntryType): Promise<KnowledgeEntry[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from('client_knowledge_entries')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (type) query = query.eq('type', type);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getKnowledgeLinks(clientId: string): Promise<KnowledgeLink[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('client_knowledge_links')
    .select('*')
    .eq('client_id', clientId);

  if (error) throw error;
  return data ?? [];
}

export async function getExternalNodes(clientId: string, links: KnowledgeLink[]): Promise<ExternalNode[]> {
  const supabase = createAdminClient();
  const nodes: ExternalNode[] = [];

  // Collect unique external IDs by type
  const externalRefs = new Map<string, Set<string>>();
  for (const link of links) {
    for (const ref of [
      { id: link.source_id, type: link.source_type },
      { id: link.target_id, type: link.target_type },
    ]) {
      if (ref.type !== 'entry') {
        if (!externalRefs.has(ref.type)) externalRefs.set(ref.type, new Set());
        externalRefs.get(ref.type)!.add(ref.id);
      }
    }
  }

  // Fetch contacts
  const contactIds = externalRefs.get('contact');
  if (contactIds?.size) {
    const { data } = await supabase
      .from('contacts')
      .select('id, full_name, role, created_at')
      .in('id', [...contactIds]);
    for (const c of data ?? []) {
      nodes.push({ id: c.id, type: 'contact', title: c.full_name, subtitle: c.role ?? '', created_at: c.created_at });
    }
  }

  // Fetch searches
  const searchIds = externalRefs.get('search');
  if (searchIds?.size) {
    const { data } = await supabase
      .from('topic_searches')
      .select('id, query, status, created_at')
      .in('id', [...searchIds]);
    for (const s of data ?? []) {
      nodes.push({ id: s.id, type: 'search', title: s.query, subtitle: s.status, created_at: s.created_at });
    }
  }

  // Fetch strategies
  const strategyIds = externalRefs.get('strategy');
  if (strategyIds?.size) {
    const { data } = await supabase
      .from('client_strategies')
      .select('id, executive_summary, created_at')
      .in('id', [...strategyIds]);
    for (const s of data ?? []) {
      nodes.push({ id: s.id, type: 'strategy', title: 'Strategy', subtitle: (s.executive_summary ?? '').substring(0, 100), created_at: s.created_at });
    }
  }

  // Fetch idea submissions
  const ideaIds = externalRefs.get('idea_submission');
  if (ideaIds?.size) {
    const { data } = await supabase
      .from('idea_submissions')
      .select('id, title, category, created_at')
      .in('id', [...ideaIds]);
    for (const i of data ?? []) {
      nodes.push({ id: i.id, type: 'idea_submission', title: i.title, subtitle: i.category ?? '', created_at: i.created_at });
    }
  }

  return nodes;
}

export async function getKnowledgeGraph(clientId: string): Promise<KnowledgeGraphData> {
  const entries = await getKnowledgeEntries(clientId);
  const links = await getKnowledgeLinks(clientId);
  const externalNodes = await getExternalNodes(clientId, links);
  return { entries, links, externalNodes };
}

export async function createKnowledgeEntry(
  entry: Omit<KnowledgeEntry, 'id' | 'created_at' | 'updated_at'>
): Promise<KnowledgeEntry> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('client_knowledge_entries')
    .insert(entry)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createKnowledgeLink(
  link: Omit<KnowledgeLink, 'id' | 'created_at'>
): Promise<KnowledgeLink> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('client_knowledge_links')
    .upsert(link, { onConflict: 'source_id,source_type,target_id,target_type' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getBrandProfile(clientId: string): Promise<KnowledgeEntry | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('client_knowledge_entries')
    .select('*')
    .eq('client_id', clientId)
    .eq('type', 'brand_profile')
    .is('metadata->>superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}
```

**Step 3: Commit**

```bash
git add lib/knowledge/types.ts lib/knowledge/queries.ts
git commit -m "feat: knowledge system types and query helpers"
```

---

## Task 3: Knowledge CRUD API Routes

**Files:**
- Create: `app/api/clients/[id]/knowledge/route.ts` (GET list + POST create)
- Create: `app/api/clients/[id]/knowledge/[entryId]/route.ts` (GET single + PATCH + DELETE)
- Create: `app/api/clients/[id]/knowledge/graph/route.ts` (GET graph data)
- Create: `app/api/clients/[id]/knowledge/links/route.ts` (POST create link + DELETE)

**Reference:** Auth + Zod pattern from `app/api/clients/analyze-url/route.ts:8-40`

**Step 1: Write GET/POST for entries list**

In `app/api/clients/[id]/knowledge/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getKnowledgeEntries, createKnowledgeEntry } from '@/lib/knowledge/queries';

const createSchema = z.object({
  type: z.enum(['brand_asset', 'brand_profile', 'document', 'web_page', 'note', 'idea']),
  title: z.string().min(1),
  content: z.string().default(''),
  metadata: z.record(z.unknown()).default({}),
  source: z.enum(['manual', 'scraped', 'generated', 'imported']).default('manual'),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const typeFilter = request.nextUrl.searchParams.get('type') as any;
  try {
    const entries = await getKnowledgeEntries(clientId, typeFilter || undefined);
    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin check
  const adminClient = createAdminClient();
  const { data: userData } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!userData || userData.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const entry = await createKnowledgeEntry({
      client_id: clientId,
      ...parsed.data,
      created_by: user.id,
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 });
  }
}
```

**Step 2: Write single entry route (GET/PATCH/DELETE)**

In `app/api/clients/[id]/knowledge/[entryId]/route.ts` — follow the same auth pattern. PATCH updates title, content, metadata. DELETE removes the entry and its links.

**Step 3: Write graph data route**

In `app/api/clients/[id]/knowledge/graph/route.ts` — auth check then call `getKnowledgeGraph(clientId)` and return the result.

**Step 4: Write links route**

In `app/api/clients/[id]/knowledge/links/route.ts` — POST creates a link (validate source/target types with Zod), DELETE removes by link ID.

**Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add app/api/clients/\[id\]/knowledge/
git commit -m "feat: knowledge CRUD and graph API routes"
```

---

## Task 4: Web Scraping Pipeline

**Files:**
- Create: `lib/knowledge/scraper.ts`
- Create: `app/api/clients/[id]/knowledge/scrape/route.ts`

**Dependencies needed:** None new — `@mozilla/readability`, `jsdom`, and `cheerio` are already available.

**Step 1: Install jsdom if not present**

Run: `npm ls jsdom` — if missing, `npm install jsdom @types/jsdom`

**Step 2: Write the scraper module**

In `lib/knowledge/scraper.ts`:

```typescript
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { createKnowledgeEntry, createKnowledgeLink } from './queries';
import type { KnowledgeEntry } from './types';

interface CrawlConfig {
  clientId: string;
  startUrl: string;
  maxPages: number;
  maxDepth: number;
  createdBy: string | null;
}

interface ScrapedPage {
  url: string;
  title: string;
  content: string;
  internalLinks: string[];
  wordCount: number;
  depth: number;
}

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN!;

async function fetchRenderedHtml(url: string): Promise<string> {
  // Use Cloudflare BR Crawl for JS-rendered pages
  const resp = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-rendering/content`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    }
  );

  if (!resp.ok) {
    // Fallback to plain fetch
    const fallback = await fetch(url);
    return await fallback.text();
  }

  const data = await resp.json();
  return data.result?.html ?? '';
}

function extractContent(html: string, url: string): { title: string; content: string; links: string[] } {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  // Extract internal links
  const baseHost = new URL(url).hostname;
  const anchors = dom.window.document.querySelectorAll('a[href]');
  const links: string[] = [];
  anchors.forEach((a) => {
    try {
      const href = new URL(a.getAttribute('href')!, url);
      if (href.hostname === baseHost && href.pathname !== new URL(url).pathname) {
        links.push(href.origin + href.pathname);
      }
    } catch { /* skip invalid URLs */ }
  });

  return {
    title: article?.title ?? dom.window.document.title ?? url,
    content: article?.textContent ?? '',
    links: [...new Set(links)],
  };
}

export async function crawlClientWebsite(config: CrawlConfig): Promise<KnowledgeEntry[]> {
  const { clientId, startUrl, maxPages, maxDepth, createdBy } = config;
  const visited = new Set<string>();
  const queue: { url: string; depth: number }[] = [{ url: startUrl, depth: 0 }];
  const pages: ScrapedPage[] = [];

  // Try sitemap first
  try {
    const sitemapUrl = new URL('/sitemap.xml', startUrl).toString();
    const sitemapResp = await fetch(sitemapUrl);
    if (sitemapResp.ok) {
      const sitemapText = await sitemapResp.text();
      const urlMatches = sitemapText.match(/<loc>(.*?)<\/loc>/g) ?? [];
      for (const match of urlMatches.slice(0, maxPages)) {
        const url = match.replace(/<\/?loc>/g, '');
        if (!visited.has(url)) {
          queue.push({ url, depth: 1 });
        }
      }
    }
  } catch { /* sitemap not available, continue with crawl */ }

  while (queue.length > 0 && pages.length < maxPages) {
    const { url, depth } = queue.shift()!;
    if (visited.has(url) || depth > maxDepth) continue;
    visited.add(url);

    try {
      const html = await fetchRenderedHtml(url);
      const { title, content, links } = extractContent(html, url);

      if (content.length < 50) continue; // Skip empty/nav-only pages

      pages.push({
        url,
        title,
        content: content.substring(0, 50000), // Cap at 50k chars
        internalLinks: links,
        wordCount: content.split(/\s+/).length,
        depth,
      });

      // Add discovered links to queue
      if (depth < maxDepth) {
        for (const link of links) {
          if (!visited.has(link)) {
            queue.push({ url: link, depth: depth + 1 });
          }
        }
      }

      // Polite delay
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.error(`Scrape failed for ${url}:`, err);
    }
  }

  // Store pages as knowledge entries
  const entries: KnowledgeEntry[] = [];
  const urlToEntry = new Map<string, KnowledgeEntry>();

  for (const page of pages) {
    const entry = await createKnowledgeEntry({
      client_id: clientId,
      type: 'web_page',
      title: page.title,
      content: page.content,
      metadata: {
        source_url: page.url,
        scraped_at: new Date().toISOString(),
        depth: page.depth,
        word_count: page.wordCount,
        status: 'completed',
      },
      source: 'scraped',
      created_by: createdBy,
    });
    entries.push(entry);
    urlToEntry.set(page.url, entry);
  }

  // Create links between pages that reference each other
  for (const page of pages) {
    const sourceEntry = urlToEntry.get(page.url);
    if (!sourceEntry) continue;

    for (const link of page.internalLinks) {
      const targetEntry = urlToEntry.get(link);
      if (targetEntry) {
        await createKnowledgeLink({
          client_id: clientId,
          source_id: sourceEntry.id,
          source_type: 'entry',
          target_id: targetEntry.id,
          target_type: 'entry',
          label: 'links_to',
        });
      }
    }
  }

  return entries;
}
```

**Step 3: Write the API route**

In `app/api/clients/[id]/knowledge/scrape/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { crawlClientWebsite } from '@/lib/knowledge/scraper';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin check
  const adminClient = createAdminClient();
  const { data: userData } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!userData || userData.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // Get client website URL
  const { data: client } = await adminClient
    .from('clients')
    .select('website_url, name')
    .eq('id', clientId)
    .single();

  if (!client?.website_url) {
    return NextResponse.json({ error: 'Client has no website URL configured' }, { status: 400 });
  }

  // Check for existing crawl in progress
  const { data: existing } = await adminClient
    .from('client_knowledge_entries')
    .select('id')
    .eq('client_id', clientId)
    .eq('type', 'web_page')
    .eq('metadata->>status', 'processing')
    .limit(1);

  if (existing?.length) {
    return NextResponse.json({ error: 'A crawl is already in progress for this client' }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const maxPages = Math.min(body.maxPages ?? 50, 100);
  const maxDepth = Math.min(body.maxDepth ?? 3, 5);

  try {
    const entries = await crawlClientWebsite({
      clientId,
      startUrl: client.website_url,
      maxPages,
      maxDepth,
      createdBy: user.id,
    });

    return NextResponse.json({
      message: `Scraped ${entries.length} pages from ${client.name}`,
      count: entries.length,
    });
  } catch (err) {
    console.error('Scrape failed:', err);
    return NextResponse.json({ error: 'Scrape failed' }, { status: 500 });
  }
}
```

**Step 4: Add env vars to `.env.local`**

```
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token
```

**Step 5: Run type check**

Run: `npx tsc --noEmit`

**Step 6: Commit**

```bash
git add lib/knowledge/scraper.ts app/api/clients/\[id\]/knowledge/scrape/
git commit -m "feat: web scraping pipeline with Cloudflare BR Crawl"
```

---

## Task 5: Brand Profile Generation

**Files:**
- Create: `lib/knowledge/brand-profile.ts`
- Create: `app/api/clients/[id]/knowledge/brand-profile/route.ts`

**Reference:** Prompt patterns in `lib/prompts/brand-context.ts:8-58` and `lib/prompts/topic-research.ts:71-220`

**Step 1: Write the brand profile generator**

In `lib/knowledge/brand-profile.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin';
import { getKnowledgeEntries, createKnowledgeEntry, createKnowledgeLink, getBrandProfile } from './queries';
import type { KnowledgeEntry } from './types';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;

interface BrandProfileContext {
  client: {
    id: string;
    name: string;
    industry: string;
    target_audience: string | null;
    brand_voice: string | null;
    topic_keywords: string[];
    website_url: string | null;
    logo_url: string | null;
    preferences: Record<string, unknown> | null;
    services: string[] | null;
    description: string | null;
  };
  scrapedPages: { title: string; content: string }[];
  contacts: { full_name: string; role: string | null }[];
  socialProfiles: { platform: string; username: string }[];
  strategy: { executive_summary: string; content_pillars: string[] } | null;
}

function buildBrandProfilePrompt(ctx: BrandProfileContext): string {
  const sections: string[] = [];

  sections.push(`You are a brand strategist creating a comprehensive brand profile for ${ctx.client.name}.`);
  sections.push(`Generate a detailed brand profile in markdown format with these sections:
## Brand Identity
Mission, values, positioning statement

## Voice & Tone
Writing style, vocabulary, do's and don'ts

## Visual Identity
Colors, typography notes, imagery style (describe what you can infer)

## Target Audience
Demographics, psychographics, pain points

## Content Themes
Core topics, content pillars, seasonal angles

## Competitive Positioning
How they differentiate in their market`);

  sections.push(`\n<client_data>`);
  sections.push(`Name: ${ctx.client.name}`);
  sections.push(`Industry: ${ctx.client.industry}`);
  if (ctx.client.description) sections.push(`Description: ${ctx.client.description}`);
  if (ctx.client.target_audience) sections.push(`Target Audience: ${ctx.client.target_audience}`);
  if (ctx.client.brand_voice) sections.push(`Brand Voice: ${ctx.client.brand_voice}`);
  if (ctx.client.topic_keywords?.length) sections.push(`Core Topics: ${ctx.client.topic_keywords.join(', ')}`);
  if (ctx.client.services?.length) sections.push(`Services: ${ctx.client.services.join(', ')}`);
  if (ctx.client.website_url) sections.push(`Website: ${ctx.client.website_url}`);

  const prefs = ctx.client.preferences as Record<string, string[]> | null;
  if (prefs) {
    if (prefs.tone_keywords?.length) sections.push(`Tone Keywords: ${prefs.tone_keywords.join(', ')}`);
    if (prefs.topics_lean_into?.length) sections.push(`Topics to Lean Into: ${prefs.topics_lean_into.join(', ')}`);
    if (prefs.topics_avoid?.length) sections.push(`Topics to Avoid: ${prefs.topics_avoid.join(', ')}`);
    if (prefs.competitor_accounts?.length) sections.push(`Competitors: ${prefs.competitor_accounts.join(', ')}`);
  }
  sections.push(`</client_data>`);

  if (ctx.socialProfiles.length > 0) {
    sections.push(`\n<social_profiles>`);
    for (const p of ctx.socialProfiles) sections.push(`- ${p.platform}: @${p.username}`);
    sections.push(`</social_profiles>`);
  }

  if (ctx.strategy) {
    sections.push(`\n<current_strategy>`);
    sections.push(ctx.strategy.executive_summary);
    if (ctx.strategy.content_pillars?.length) {
      sections.push(`Content Pillars: ${ctx.strategy.content_pillars.join(', ')}`);
    }
    sections.push(`</current_strategy>`);
  }

  if (ctx.scrapedPages.length > 0) {
    sections.push(`\n<website_content>`);
    for (const page of ctx.scrapedPages.slice(0, 10)) {
      sections.push(`### ${page.title}\n${page.content.substring(0, 3000)}\n`);
    }
    sections.push(`</website_content>`);
  }

  if (ctx.contacts.length > 0) {
    sections.push(`\n<key_contacts>`);
    for (const c of ctx.contacts) sections.push(`- ${c.full_name} (${c.role ?? 'no role specified'})`);
    sections.push(`</key_contacts>`);
  }

  return sections.join('\n');
}

export async function generateBrandProfile(
  clientId: string,
  createdBy: string | null
): Promise<KnowledgeEntry> {
  const adminClient = createAdminClient();

  // Gather all context
  const { data: client } = await adminClient
    .from('clients')
    .select('id, name, industry, target_audience, brand_voice, topic_keywords, website_url, logo_url, preferences, services, description')
    .eq('id', clientId)
    .single();

  if (!client) throw new Error('Client not found');

  const [
    { data: contacts },
    { data: socialProfiles },
    { data: strategy },
  ] = await Promise.all([
    adminClient.from('contacts').select('full_name, role').eq('client_id', clientId),
    adminClient.from('social_profiles').select('platform, username').eq('client_id', clientId),
    adminClient.from('client_strategies')
      .select('executive_summary, content_pillars')
      .eq('client_id', clientId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const scrapedPages = await getKnowledgeEntries(clientId, 'web_page');

  const prompt = buildBrandProfilePrompt({
    client: client as BrandProfileContext['client'],
    scrapedPages: scrapedPages.map((p) => ({ title: p.title, content: p.content })),
    contacts: contacts ?? [],
    socialProfiles: socialProfiles ?? [],
    strategy: strategy ?? null,
  });

  // Call Claude via OpenRouter
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
    }),
  });

  const data = await response.json();
  const profileContent = data.choices?.[0]?.message?.content ?? '';

  // Supersede old brand profile if exists
  const existing = await getBrandProfile(clientId);
  if (existing) {
    await adminClient
      .from('client_knowledge_entries')
      .update({ metadata: { ...existing.metadata, superseded_by: 'new' } })
      .eq('id', existing.id);
  }

  // Create new brand profile entry
  const generatedFrom: string[] = [];
  if (scrapedPages.length > 0) generatedFrom.push('web_pages');
  if (strategy) generatedFrom.push('strategy');
  if (contacts?.length) generatedFrom.push('contacts');
  if (socialProfiles?.length) generatedFrom.push('social_profiles');

  const entry = await createKnowledgeEntry({
    client_id: clientId,
    type: 'brand_profile',
    title: `${client.name} — Brand Profile`,
    content: profileContent,
    metadata: { generated_from: generatedFrom },
    source: 'generated',
    created_by: createdBy,
  });

  // Auto-link to scraped pages
  for (const page of scrapedPages.slice(0, 10)) {
    await createKnowledgeLink({
      client_id: clientId,
      source_id: entry.id,
      source_type: 'entry',
      target_id: page.id,
      target_type: 'entry',
      label: 'informed_by',
    });
  }

  // Auto-link to strategy
  if (strategy) {
    await createKnowledgeLink({
      client_id: clientId,
      source_id: entry.id,
      source_type: 'entry',
      target_id: (strategy as any).id,
      target_type: 'strategy',
      label: 'informed_by',
    });
  }

  // Auto-link to contacts
  for (const c of (contacts ?? []).slice(0, 5)) {
    await createKnowledgeLink({
      client_id: clientId,
      source_id: entry.id,
      source_type: 'entry',
      target_id: (c as any).id,
      target_type: 'contact',
      label: 'stakeholder',
    });
  }

  return entry;
}
```

**Step 2: Write the API route**

In `app/api/clients/[id]/knowledge/brand-profile/route.ts` — auth check, admin check, call `generateBrandProfile(clientId, user.id)`, return the entry.

**Step 3: Run type check**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add lib/knowledge/brand-profile.ts app/api/clients/\[id\]/knowledge/brand-profile/
git commit -m "feat: AI-powered brand profile generation"
```

---

## Task 6: Idea Generator

**Files:**
- Create: `lib/knowledge/idea-generator.ts`
- Create: `app/api/clients/[id]/knowledge/generate-ideas/route.ts`

**Reference:** Content memory pattern from `lib/vault/content-memory.ts:33-93`

**Step 1: Write the idea generator**

In `lib/knowledge/idea-generator.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin';
import { getKnowledgeEntries, getBrandProfile } from './queries';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;

export interface GeneratedIdea {
  title: string;
  description: string;
  hook: string;
  format: 'short_form' | 'long_form' | 'reel' | 'story';
  content_pillar: string;
}

interface IdeaGeneratorConfig {
  clientId: string;
  concept?: string;
  count: number;
}

export async function generateVideoIdeas(config: IdeaGeneratorConfig): Promise<GeneratedIdea[]> {
  const { clientId, concept, count } = config;
  const adminClient = createAdminClient();

  // Gather context
  const [
    brandProfile,
    { data: client },
    { data: searches },
    { data: contentLogs },
    { data: strategy },
    savedIdeas,
  ] = await Promise.all([
    getBrandProfile(clientId),
    adminClient.from('clients')
      .select('name, industry, target_audience, brand_voice, topic_keywords, preferences')
      .eq('id', clientId).single(),
    adminClient.from('topic_searches')
      .select('query, summary, trending_topics')
      .eq('client_id', clientId).eq('status', 'completed')
      .order('created_at', { ascending: false }).limit(10),
    adminClient.from('content_logs')
      .select('title, content_type, platform, performance_notes')
      .eq('client_id', clientId)
      .order('published_at', { ascending: false }).limit(15),
    adminClient.from('client_strategies')
      .select('content_pillars, executive_summary')
      .eq('client_id', clientId).eq('status', 'completed')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    getKnowledgeEntries(clientId, 'idea'),
  ]);

  if (!client) throw new Error('Client not found');

  // Build prompt
  const sections: string[] = [];

  sections.push(`You are a creative director generating ${count} video content ideas for a brand shoot.
Return a JSON array of objects with these fields:
- title: catchy title for the video
- description: 2-3 sentence description of the concept
- hook: the opening hook/line to grab attention
- format: one of "short_form", "long_form", "reel", "story"
- content_pillar: which content pillar this aligns with

Requirements:
- Ideas must be actionable for a videographer showing up on set
- Align with the brand voice and target audience
- Avoid repeating ideas that have already been produced
- Each idea should feel distinct from the others
Return ONLY the JSON array, no other text.`);

  sections.push(`\n<brand>`);
  sections.push(`Name: ${client.name}`);
  sections.push(`Industry: ${client.industry}`);
  if (client.target_audience) sections.push(`Audience: ${client.target_audience}`);
  if (client.brand_voice) sections.push(`Voice: ${client.brand_voice}`);
  if (client.topic_keywords?.length) sections.push(`Core Topics: ${(client.topic_keywords as string[]).join(', ')}`);
  sections.push(`</brand>`);

  if (brandProfile) {
    sections.push(`\n<brand_profile>\n${brandProfile.content.substring(0, 4000)}\n</brand_profile>`);
  }

  if (strategy) {
    sections.push(`\n<strategy>`);
    if (strategy.content_pillars?.length) sections.push(`Pillars: ${(strategy.content_pillars as string[]).join(', ')}`);
    if (strategy.executive_summary) sections.push(strategy.executive_summary.substring(0, 1000));
    sections.push(`</strategy>`);
  }

  if (searches?.length) {
    sections.push(`\n<past_research>`);
    for (const s of searches) {
      const topics = Array.isArray(s.trending_topics)
        ? s.trending_topics.map((t: any) => t.name ?? t).join(', ')
        : '';
      sections.push(`- "${s.query}": ${topics}`);
    }
    sections.push(`</past_research>`);
  }

  if (contentLogs?.length) {
    sections.push(`\n<already_produced>`);
    for (const log of contentLogs) {
      sections.push(`- ${log.title} (${log.content_type ?? 'video'} on ${log.platform ?? 'unknown'})`);
    }
    sections.push(`</already_produced>`);
  }

  if (savedIdeas.length > 0) {
    sections.push(`\n<saved_ideas_avoid_repeating>`);
    for (const idea of savedIdeas.slice(0, 20)) {
      sections.push(`- ${idea.title}`);
    }
    sections.push(`</saved_ideas_avoid_repeating>`);
  }

  if (concept) {
    sections.push(`\n<concept_direction>\nThe shoot concept or theme is: ${concept}\nTailor all ideas to this direction.\n</concept_direction>`);
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      messages: [{ role: 'user', content: sections.join('\n') }],
      max_tokens: 3000,
    }),
  });

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? '[]';

  // Parse JSON from response (handle markdown code fences)
  const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const ideas: GeneratedIdea[] = JSON.parse(jsonStr);

  return ideas.slice(0, count);
}
```

**Step 2: Write the API route**

In `app/api/clients/[id]/knowledge/generate-ideas/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateVideoIdeas } from '@/lib/knowledge/idea-generator';

const ideaSchema = z.object({
  concept: z.string().optional(),
  count: z.number().min(1).max(20).default(10),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = ideaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const ideas = await generateVideoIdeas({
      clientId,
      concept: parsed.data.concept,
      count: parsed.data.count,
    });
    return NextResponse.json({ ideas });
  } catch (err) {
    console.error('Idea generation failed:', err);
    return NextResponse.json({ error: 'Failed to generate ideas' }, { status: 500 });
  }
}
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add lib/knowledge/idea-generator.ts app/api/clients/\[id\]/knowledge/generate-ideas/
git commit -m "feat: AI-powered video idea generator"
```

---

## Task 7: Knowledge Graph UI

**Files:**
- Install: `dagre` + `@types/dagre`
- Create: `app/admin/clients/[slug]/knowledge/page.tsx`
- Create: `components/knowledge/KnowledgeGraph.tsx`
- Create: `components/knowledge/KnowledgeNodeCard.tsx`
- Create: `components/knowledge/KnowledgePanel.tsx`
- Create: `components/knowledge/KnowledgeToolbar.tsx`
- Create: `lib/knowledge/graph-layout.ts`

**Reference:** ReactFlow pattern from `app/admin/moodboard/[id]/page.tsx:1-57`

**Step 1: Install dagre**

Run: `npm install dagre @types/dagre`

**Step 2: Write graph layout utility**

In `lib/knowledge/graph-layout.ts`:

```typescript
import dagre from 'dagre';
import type { Node, Edge } from 'reactflow';

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 80, ranksep: 100 });

  for (const node of nodes) {
    g.setNode(node.id, { width: 220, height: 80 });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - 110, y: pos.y - 40 },
    };
  });

  return { nodes: layoutedNodes, edges };
}
```

**Step 3: Write KnowledgeNodeCard component**

In `components/knowledge/KnowledgeNodeCard.tsx`:

```typescript
'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { FileText, Globe, Palette, StickyNote, User, Search, Target, Lightbulb } from 'lucide-react';

const TYPE_CONFIG: Record<string, { color: string; icon: typeof FileText; label: string }> = {
  brand_profile: { color: 'border-blue-500 bg-blue-500/10', icon: Palette, label: 'Brand Profile' },
  brand_asset: { color: 'border-blue-400 bg-blue-400/10', icon: Palette, label: 'Brand Asset' },
  web_page: { color: 'border-green-500 bg-green-500/10', icon: Globe, label: 'Web Page' },
  note: { color: 'border-yellow-500 bg-yellow-500/10', icon: StickyNote, label: 'Note' },
  document: { color: 'border-purple-500 bg-purple-500/10', icon: FileText, label: 'Document' },
  idea: { color: 'border-pink-500 bg-pink-500/10', icon: Lightbulb, label: 'Idea' },
  contact: { color: 'border-orange-500 bg-orange-500/10', icon: User, label: 'Contact' },
  search: { color: 'border-teal-500 bg-teal-500/10', icon: Search, label: 'Research' },
  strategy: { color: 'border-red-500 bg-red-500/10', icon: Target, label: 'Strategy' },
  idea_submission: { color: 'border-pink-400 bg-pink-400/10', icon: Lightbulb, label: 'Client Idea' },
};

function KnowledgeNodeCard({ data }: NodeProps) {
  const config = TYPE_CONFIG[data.type] ?? TYPE_CONFIG.note;
  const Icon = config.icon;

  return (
    <div className={`rounded-lg border-2 ${config.color} px-3 py-2 min-w-[200px] max-w-[240px] cursor-pointer transition-shadow hover:shadow-lg`}>
      <Handle type="target" position={Position.Top} className="!bg-text-secondary" />
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-text-secondary shrink-0" />
        <span className="text-[10px] text-text-secondary uppercase tracking-wide">{config.label}</span>
      </div>
      <p className="text-sm font-medium text-text-primary truncate">{data.title}</p>
      {data.subtitle && (
        <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{data.subtitle}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-text-secondary" />
    </div>
  );
}

export default memo(KnowledgeNodeCard);
```

**Step 4: Write KnowledgeToolbar component**

In `components/knowledge/KnowledgeToolbar.tsx` — a toolbar with type filter toggles (checkboxes per node type), a search input, and action buttons (Add Entry, Scrape Website, Generate Brand Profile). Each button calls the respective API.

**Step 5: Write KnowledgePanel component**

In `components/knowledge/KnowledgePanel.tsx` — a slide-out panel that receives the selected node data and displays: full content (rendered markdown), metadata fields, linked entries list, and an edit button that opens a modal/form.

**Step 6: Write KnowledgeGraph component**

In `components/knowledge/KnowledgeGraph.tsx`:

```typescript
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import KnowledgeNodeCard from './KnowledgeNodeCard';
import KnowledgePanel from './KnowledgePanel';
import KnowledgeToolbar from './KnowledgeToolbar';
import { getLayoutedElements } from '@/lib/knowledge/graph-layout';
import type { KnowledgeGraphData } from '@/lib/knowledge/types';

const nodeTypes: NodeTypes = {
  knowledge: KnowledgeNodeCard,
};

interface Props {
  clientId: string;
  clientSlug: string;
  clientName: string;
  initialData: KnowledgeGraphData;
}

export default function KnowledgeGraph({ clientId, clientSlug, clientName, initialData }: Props) {
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Build nodes from entries + external nodes
  const allNodes: Node[] = useMemo(() => {
    const nodes: Node[] = [];

    for (const entry of initialData.entries) {
      nodes.push({
        id: `entry-${entry.id}`,
        type: 'knowledge',
        position: { x: 0, y: 0 },
        data: {
          ...entry,
          nodeType: 'entry',
          subtitle: entry.content.substring(0, 80),
        },
      });
    }

    for (const ext of initialData.externalNodes) {
      nodes.push({
        id: `${ext.type}-${ext.id}`,
        type: 'knowledge',
        position: { x: 0, y: 0 },
        data: {
          id: ext.id,
          type: ext.type,
          nodeType: ext.type,
          title: ext.title,
          subtitle: ext.subtitle,
        },
      });
    }

    return nodes;
  }, [initialData]);

  // Build edges from links
  const allEdges: Edge[] = useMemo(() => {
    return initialData.links.map((link) => ({
      id: `link-${link.id}`,
      source: `${link.source_type === 'entry' ? 'entry' : link.source_type}-${link.source_id}`,
      target: `${link.target_type === 'entry' ? 'entry' : link.target_type}-${link.target_id}`,
      label: link.label,
      animated: true,
      style: { stroke: '#64748b' },
    }));
  }, [initialData]);

  // Apply filters + layout
  const { layoutNodes, layoutEdges } = useMemo(() => {
    let filtered = allNodes;

    if (typeFilters.size > 0) {
      filtered = allNodes.filter((n) => typeFilters.has(n.data.type));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (n) => n.data.title?.toLowerCase().includes(q) || n.data.subtitle?.toLowerCase().includes(q)
      );
    }

    const filteredIds = new Set(filtered.map((n) => n.id));
    const filteredEdges = allEdges.filter(
      (e) => filteredIds.has(e.source) && filteredIds.has(e.target)
    );

    const { nodes: ln, edges: le } = getLayoutedElements(filtered, filteredEdges);
    return { layoutNodes: ln, layoutEdges: le };
  }, [allNodes, allEdges, typeFilters, searchQuery]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  useEffect(() => {
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [layoutNodes, layoutEdges, setNodes, setEdges]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node.data);
  }, []);

  return (
    <div className="h-[calc(100vh-200px)] relative">
      <KnowledgeToolbar
        clientId={clientId}
        typeFilters={typeFilters}
        onTypeFiltersChange={setTypeFilters}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          minZoom={0.1}
          maxZoom={2}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
          <Controls className="!bg-surface !border-nativz-border" />
          <MiniMap
            className="!bg-surface !border-nativz-border"
            nodeColor={(n) => {
              const colors: Record<string, string> = {
                brand_profile: '#3b82f6', web_page: '#22c55e', note: '#eab308',
                document: '#a855f7', contact: '#f97316', search: '#14b8a6',
                strategy: '#ef4444', idea: '#ec4899', idea_submission: '#f472b6',
              };
              return colors[n.data?.type] ?? '#64748b';
            }}
          />
        </ReactFlow>
      </ReactFlowProvider>
      {selectedNode && (
        <KnowledgePanel
          node={selectedNode}
          clientId={clientId}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
```

**Step 7: Write the page route**

In `app/admin/clients/[slug]/knowledge/page.tsx`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin';
import { getKnowledgeGraph } from '@/lib/knowledge/queries';
import KnowledgeGraph from '@/components/knowledge/KnowledgeGraph';

export default async function ClientKnowledgePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, slug')
    .eq('slug', slug)
    .single();

  if (!client) {
    return <div className="p-8 text-text-secondary">Client not found</div>;
  }

  const graphData = await getKnowledgeGraph(client.id);

  return (
    <div>
      <KnowledgeGraph
        clientId={client.id}
        clientSlug={client.slug}
        clientName={client.name}
        initialData={graphData}
      />
    </div>
  );
}
```

**Step 8: Run dev server and verify**

Run: `npm run dev`
Navigate to `/admin/clients/{any-slug}/knowledge`
Expected: Empty graph with toolbar renders without errors

**Step 9: Commit**

```bash
git add components/knowledge/ lib/knowledge/graph-layout.ts app/admin/clients/\[slug\]/knowledge/
git commit -m "feat: knowledge graph UI with ReactFlow"
```

---

## Task 8: Nerd Tool Integration

**Files:**
- Create: `lib/nerd/tools/knowledge.ts`
- Modify: `lib/nerd/tools/index.ts` (~line 10, add import + registration)
- Modify: `app/api/nerd/chat/route.ts` (~line 109-139, expand `buildClientSummary`)

**Reference:** Tool pattern from `lib/nerd/tools/clients.ts:7-77`

**Step 1: Write knowledge tools**

In `lib/nerd/tools/knowledge.ts`:

```typescript
import { z } from 'zod';
import type { ToolDefinition } from '../types';
import { getKnowledgeEntries, getBrandProfile } from '@/lib/knowledge/queries';
import { generateBrandProfile } from '@/lib/knowledge/brand-profile';
import { generateVideoIdeas } from '@/lib/knowledge/idea-generator';

export const knowledgeTools: ToolDefinition[] = [
  {
    name: 'query_client_knowledge',
    description: 'Search a client\'s knowledge base for entries by keyword or type. Use when asked about a client\'s brand, website content, saved notes, or documents.',
    parameters: z.object({
      client_id: z.string().describe('The client UUID'),
      type: z.enum(['brand_asset', 'brand_profile', 'document', 'web_page', 'note', 'idea']).optional().describe('Filter by entry type'),
      keyword: z.string().optional().describe('Search keyword to filter results'),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        let entries = await getKnowledgeEntries(params.client_id, params.type);
        if (params.keyword) {
          const q = params.keyword.toLowerCase();
          entries = entries.filter(
            (e) => e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q)
          );
        }
        return {
          success: true,
          data: {
            count: entries.length,
            entries: entries.slice(0, 10).map((e) => ({
              id: e.id,
              type: e.type,
              title: e.title,
              snippet: e.content.substring(0, 300),
              source: e.source,
              created_at: e.created_at,
            })),
          },
        };
      } catch (err) {
        return { success: false, error: 'Failed to query knowledge base' };
      }
    },
  },
  {
    name: 'generate_brand_profile',
    description: 'Generate or regenerate a comprehensive brand profile for a client using all available data (website, strategy, contacts, preferences).',
    parameters: z.object({
      client_id: z.string().describe('The client UUID'),
    }),
    riskLevel: 'write',
    handler: async (params) => {
      try {
        const entry = await generateBrandProfile(params.client_id, null);
        return {
          success: true,
          data: {
            id: entry.id,
            title: entry.title,
            snippet: entry.content.substring(0, 500),
          },
          cardType: 'knowledge' as const,
        };
      } catch (err) {
        return { success: false, error: 'Failed to generate brand profile' };
      }
    },
  },
  {
    name: 'generate_video_ideas',
    description: 'Generate video content ideas for a client based on their brand knowledge, past research, and content history. Optionally provide a concept/theme.',
    parameters: z.object({
      client_id: z.string().describe('The client UUID'),
      concept: z.string().optional().describe('Optional shoot concept or theme direction'),
      count: z.number().min(1).max(20).default(10).describe('Number of ideas to generate'),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const ideas = await generateVideoIdeas({
          clientId: params.client_id,
          concept: params.concept,
          count: params.count,
        });
        return {
          success: true,
          data: { ideas },
        };
      } catch (err) {
        return { success: false, error: 'Failed to generate ideas' };
      }
    },
  },
];
```

**Step 2: Register tools in index**

In `lib/nerd/tools/index.ts`, add:
```typescript
import { knowledgeTools } from './knowledge';
// In registerAllTools():
registerTools(knowledgeTools);
```

**Step 3: Expand buildClientSummary**

In `app/api/nerd/chat/route.ts` around line 139, after the existing summary, add a knowledge summary block:

```typescript
// After existing buildClientSummary, add:
async function buildKnowledgeSummary(clientId: string): Promise<string> {
  const entries = await getKnowledgeEntries(clientId);
  if (entries.length === 0) return '';

  const parts: string[] = ['Knowledge Base:'];
  const counts: Record<string, number> = {};
  for (const e of entries) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
  }
  parts.push(`  Entries: ${Object.entries(counts).map(([t, c]) => `${c} ${t}s`).join(', ')}`);

  const brandProfile = entries.find((e) => e.type === 'brand_profile');
  if (brandProfile) {
    parts.push(`  Brand Profile: ${brandProfile.content.substring(0, 300)}...`);
  }

  return parts.join('\n');
}
```

Call this inside the client mention loop and append to the client summary.

**Step 4: Run type check**

Run: `npx tsc --noEmit`

**Step 5: Commit**

```bash
git add lib/nerd/tools/knowledge.ts lib/nerd/tools/index.ts app/api/nerd/chat/route.ts
git commit -m "feat: nerd knowledge tools (query, brand profile, idea generator)"
```

---

## Task 9: Topic Search & Moodboard Integration

**Files:**
- Modify: `lib/prompts/topic-research.ts` (~line 83, add client knowledge block)
- Modify: `lib/vault/content-memory.ts` (add knowledge entries to client memory)
- Modify: `app/api/moodboard/chat/route.ts` (~line 138, add brand profile to moodboard context)

**Step 1: Add knowledge to topic research prompt**

In `lib/prompts/topic-research.ts`, inside `buildTopicResearchPrompt()`, after the existing `clientBlock` (~line 99), add:

```typescript
const knowledgeBlock = config.clientKnowledgeBlock
  ? `\n<client_knowledge>\n${config.clientKnowledgeBlock}\n</client_knowledge>`
  : '';
```

Add `clientKnowledgeBlock?: string | null` to the `TopicResearchConfig` interface.

In the search processor route (`app/api/search/[id]/process/route.ts`), before building the prompt, fetch the brand profile and recent ideas to pass as `clientKnowledgeBlock`.

**Step 2: Add knowledge to content memory**

In `lib/vault/content-memory.ts`, add a new field to `ClientMemory`:

```typescript
knowledgeSummary: string | null;
```

In `getClientMemory()`, fetch the brand profile and entry counts, format them into a summary string.

In `formatClientMemoryBlock()`, add:
```typescript
if (memory.knowledgeSummary) {
  sections.push(`<knowledge_summary>\n${memory.knowledgeSummary}\n</knowledge_summary>`);
}
```

**Step 3: Add brand profile to moodboard context**

In `app/api/moodboard/chat/route.ts`, inside the client context loop (~line 160), after fetching strategy, also fetch the brand profile:

```typescript
const brandProfile = await getBrandProfile(client.id);
if (brandProfile) {
  parts.push(`\nBrand Profile:\n${brandProfile.content.substring(0, 2000)}`);
}
```

**Step 4: Run type check**

Run: `npx tsc --noEmit`

**Step 5: Commit**

```bash
git add lib/prompts/topic-research.ts lib/vault/content-memory.ts app/api/moodboard/chat/route.ts
git commit -m "feat: integrate knowledge into topic search and moodboard context"
```

---

## Task 10: Vault Sync for Knowledge Entries

**Files:**
- Create: `lib/knowledge/vault-sync.ts`
- Modify: `lib/knowledge/queries.ts` (add sync calls after create/update)

**Reference:** Vault sync pattern from `lib/vault/sync.ts:27-44`

**Step 1: Write knowledge vault sync**

In `lib/knowledge/vault-sync.ts`:

```typescript
import { isVaultConfigured, writeFile } from '@/lib/vault/github';
import type { KnowledgeEntry, KnowledgeLink } from './types';

function knowledgePath(clientName: string, entry: KnowledgeEntry): string {
  const safe = (s: string) => s.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 80);
  const name = safe(clientName);
  const title = safe(entry.title);

  const typeFolder: Record<string, string> = {
    brand_profile: 'Knowledge',
    brand_asset: 'Knowledge/Assets',
    web_page: 'Knowledge/Web',
    document: 'Knowledge/Documents',
    note: 'Knowledge/Notes',
    idea: 'Knowledge/Ideas',
  };

  const folder = typeFolder[entry.type] ?? 'Knowledge';

  if (entry.type === 'brand_profile') {
    return `Clients/${name}/Knowledge/Brand Profile.md`;
  }

  return `Clients/${name}/${folder}/${title}.md`;
}

function formatEntryMarkdown(entry: KnowledgeEntry, links: KnowledgeLink[], linkedTitles: Map<string, string>): string {
  const parts: string[] = [];

  parts.push(`---`);
  parts.push(`type: ${entry.type}`);
  parts.push(`source: ${entry.source}`);
  parts.push(`created: ${entry.created_at}`);
  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    parts.push(`metadata: ${JSON.stringify(entry.metadata)}`);
  }
  parts.push(`---`);
  parts.push('');
  parts.push(`# ${entry.title}`);
  parts.push('');
  parts.push(entry.content);

  // Add wiki-links for related entries
  const related = links.filter(
    (l) =>
      (l.source_id === entry.id && l.source_type === 'entry') ||
      (l.target_id === entry.id && l.target_type === 'entry')
  );

  if (related.length > 0) {
    parts.push('');
    parts.push('## Related');
    for (const link of related) {
      const otherId = link.source_id === entry.id ? link.target_id : link.source_id;
      const title = linkedTitles.get(otherId) ?? otherId;
      parts.push(`- [[${title}]] (${link.label})`);
    }
  }

  return parts.join('\n');
}

export async function syncKnowledgeEntryToVault(
  entry: KnowledgeEntry,
  clientName: string,
  links: KnowledgeLink[],
  linkedTitles: Map<string, string>
): Promise<void> {
  if (!isVaultConfigured()) return;

  try {
    const markdown = formatEntryMarkdown(entry, links, linkedTitles);
    const path = knowledgePath(clientName, entry);
    await writeFile(path, markdown, `knowledge: ${entry.title}`);
  } catch (error) {
    console.error('Vault sync (knowledge) failed:', error);
  }
}
```

**Step 2: Add sync calls to query helpers**

In `lib/knowledge/queries.ts`, after `createKnowledgeEntry` returns, fire off a non-blocking vault sync (similar to existing pattern — call but don't await).

**Step 3: Run type check**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add lib/knowledge/vault-sync.ts lib/knowledge/queries.ts
git commit -m "feat: vault sync for knowledge entries with wiki-links"
```

---

## Task 11: V1 API Endpoints & API Docs Update

**Files:**
- Create: `app/api/v1/clients/[id]/knowledge/route.ts` (GET list + POST create)
- Create: `app/api/v1/clients/[id]/knowledge/[entryId]/route.ts` (GET single)
- Create: `app/api/v1/clients/[id]/knowledge/graph/route.ts` (GET graph)
- Modify: `app/admin/nerd/api/page.tsx` (~line 7-24, add knowledge endpoints to ENDPOINTS array)

**Step 1: Write V1 routes**

These mirror the internal API routes but use API key auth (Bearer token) instead of session auth. Follow the existing v1 route pattern.

**Step 2: Update API docs page**

In `app/admin/nerd/api/page.tsx`, add to the ENDPOINTS array:

```typescript
{ method: 'GET', path: '/api/v1/clients/:id/knowledge', scope: 'knowledge', description: 'List knowledge entries for a client' },
{ method: 'POST', path: '/api/v1/clients/:id/knowledge', scope: 'knowledge', description: 'Create a knowledge entry' },
{ method: 'GET', path: '/api/v1/clients/:id/knowledge/:entryId', scope: 'knowledge', description: 'Get a single knowledge entry' },
{ method: 'GET', path: '/api/v1/clients/:id/knowledge/graph', scope: 'knowledge', description: 'Get knowledge graph data (entries + links)' },
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add app/api/v1/clients/\[id\]/knowledge/ app/admin/nerd/api/page.tsx
git commit -m "feat: v1 knowledge API endpoints and docs update"
```

---

## Task 12: Idea Generator UI

**Files:**
- Create: `app/admin/clients/[slug]/ideas/generate/page.tsx`
- Create: `components/knowledge/IdeaGenerator.tsx`
- Create: `components/knowledge/IdeaCard.tsx`

**Step 1: Write IdeaCard component**

In `components/knowledge/IdeaCard.tsx` — displays a single generated idea with title/hook, description, format badge, content pillar tag, and a "Save" button that POSTs to the knowledge entries API.

**Step 2: Write IdeaGenerator component**

In `components/knowledge/IdeaGenerator.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import IdeaCard from './IdeaCard';
import type { GeneratedIdea } from '@/lib/knowledge/idea-generator';

interface Props {
  clientId: string;
  clientName: string;
}

export default function IdeaGenerator({ clientId, clientName }: Props) {
  const [concept, setConcept] = useState('');
  const [count, setCount] = useState(10);
  const [ideas, setIdeas] = useState<GeneratedIdea[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/knowledge/generate-ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept: concept || undefined, count }),
      });
      const data = await res.json();
      setIdeas(data.ideas ?? []);
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface rounded-xl border border-nativz-border p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Idea generator</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-secondary mb-1 block">Concept or theme (optional)</label>
            <input
              type="text"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="e.g. summer fitness tips, behind the scenes..."
              className="w-full bg-background border border-nativz-border rounded-lg px-3 py-2 text-sm text-text-primary"
            />
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-sm text-text-secondary mb-1 block">Number of ideas</label>
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="bg-background border border-nativz-border rounded-lg px-3 py-2 text-sm text-text-primary"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={15}>15</option>
              </select>
            </div>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="mt-auto px-4 py-2 bg-accent-text text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Generate ideas
            </button>
          </div>
        </div>
      </div>

      {ideas.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ideas.map((idea, i) => (
            <IdeaCard key={i} idea={idea} clientId={clientId} />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Write the page route**

In `app/admin/clients/[slug]/ideas/generate/page.tsx` — server component that fetches the client, renders `<IdeaGenerator clientId={client.id} clientName={client.name} />`.

**Step 4: Run dev server and verify**

Run: `npm run dev`
Navigate to `/admin/clients/{slug}/ideas/generate`
Expected: Form renders, generates ideas on click

**Step 5: Commit**

```bash
git add components/knowledge/IdeaCard.tsx components/knowledge/IdeaGenerator.tsx app/admin/clients/\[slug\]/ideas/generate/
git commit -m "feat: idea generator UI on client profile"
```

---

## Task 13: Link Client Profile to Knowledge Tab

**Files:**
- Modify: `app/admin/clients/[slug]/page.tsx` (add navigation link/tab to knowledge page)
- Modify: Client profile layout/navigation component (if exists) to include Knowledge tab

**Step 1: Add tab navigation**

Add a link to `/admin/clients/{slug}/knowledge` alongside existing Ideas and Settings tabs on the client profile page. Use the same tab styling pattern.

**Step 2: Add "Generate brand profile" button to client profile sidebar**

In the client profile page, add a button that calls `POST /api/clients/{id}/knowledge/brand-profile`. Show loading state and success feedback.

**Step 3: Add "Scrape website" button**

If the client has a `website_url`, show a "Scrape website" button that calls `POST /api/clients/{id}/knowledge/scrape`.

**Step 4: Run dev server and verify full flow**

1. Navigate to client profile
2. Click "Knowledge" tab → see empty graph
3. Click "Scrape website" → pages get scraped and appear as nodes
4. Click "Generate brand profile" → brand profile appears linked to web pages
5. Navigate to idea generator → generate ideas based on knowledge
6. Open Nerd → ask about client knowledge → tool responds

**Step 5: Commit**

```bash
git add app/admin/clients/\[slug\]/
git commit -m "feat: link knowledge tab and actions to client profile"
```

---

## Task 14: Final Type Check & Build Verification

**Step 1: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors (or only pre-existing warnings)

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve type and lint errors from knowledge system"
```

---

Plan complete and saved to `docs/plans/2026-03-11-client-knowledge-system-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open a new session with executing-plans, batch execution with checkpoints

Which approach?