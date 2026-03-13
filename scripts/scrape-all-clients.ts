/**
 * Batch scrape all active client websites and generate brand profiles.
 *
 * Usage:
 *   npx tsx scripts/scrape-all-clients.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

// ── Load env ───────────────────────────────────────────────────────────────────

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Single shared client for the entire run
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Constants ──────────────────────────────────────────────────────────────────

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FETCH_TIMEOUT = 12_000;
const DELAY_MS = 800;
const MIN_CONTENT = 100;
const MAX_CONTENT = 50_000;
const MAX_PAGES = 25;
const MAX_DEPTH = 2;

// ── Helpers ────────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeUrl(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    url.hash = '';
    let s = url.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}

function isSameDomain(url: string, origin: string): boolean {
  try { return new URL(url).origin === origin; } catch { return false; }
}

function isPageUrl(url: string): boolean {
  const ext = new URL(url).pathname.split('.').pop()?.toLowerCase() ?? '';
  const skip = new Set(['jpg','jpeg','png','gif','svg','webp','ico','pdf','zip','mp4','mp3','css','js','json','xml','woff','woff2','ttf','eot']);
  return !skip.has(ext);
}

// ── Fetch page ─────────────────────────────────────────────────────────────────

async function fetchPage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html') && !ct.includes('text/plain') && !ct.includes('application/xhtml')) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Extract content ────────────────────────────────────────────────────────────

function extractContent(html: string, url: string): { title: string; content: string; links: string[] } | null {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  // Try Readability first
  const reader = new Readability(doc);
  const article = reader.parse();
  let content = article?.textContent?.trim() ?? '';

  // Fallback: grab all visible text from body if Readability fails
  if (content.length < MIN_CONTENT) {
    const dom2 = new JSDOM(html, { url });
    const body = dom2.window.document.body;
    if (body) {
      // Remove script/style tags
      for (const el of body.querySelectorAll('script, style, noscript')) el.remove();
      content = (body.textContent ?? '').replace(/\s+/g, ' ').trim();
    }
  }

  if (content.length < MIN_CONTENT) return null;

  const title = article?.title || doc.title || new URL(url).pathname;
  const cappedContent = content.length > MAX_CONTENT ? content.slice(0, MAX_CONTENT) : content;

  // Extract same-domain links
  const origin = new URL(url).origin;
  const links: string[] = [];
  const dom3 = new JSDOM(html, { url });
  for (const anchor of dom3.window.document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href');
    if (!href) continue;
    const normalized = normalizeUrl(href, url);
    if (normalized && isSameDomain(normalized, origin) && isPageUrl(normalized)) {
      links.push(normalized);
    }
  }

  return { title, content: cappedContent, links: [...new Set(links)] };
}

// ── Sitemap ────────────────────────────────────────────────────────────────────

async function fetchSitemapUrls(startUrl: string): Promise<string[]> {
  const origin = new URL(startUrl).origin;
  const xml = await fetchPage(`${origin}/sitemap.xml`);
  if (!xml) return [];
  const urls: string[] = [];
  const re = /<loc>\s*(.*?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] && isPageUrl(m[1])) urls.push(m[1]);
  }
  return urls;
}

// ── Scrape one client ──────────────────────────────────────────────────────────

interface ScrapedPage {
  url: string;
  title: string;
  content: string;
  depth: number;
}

async function scrapeClient(startUrl: string): Promise<ScrapedPage[]> {
  const origin = new URL(startUrl).origin;
  const visited = new Set<string>();
  const queue: { url: string; depth: number }[] = [];
  const pages: ScrapedPage[] = [];

  // Sitemap first
  const sitemapUrls = await fetchSitemapUrls(startUrl);
  for (const url of sitemapUrls.slice(0, MAX_PAGES)) {
    const n = normalizeUrl(url, origin);
    if (n && !visited.has(n)) { queue.push({ url: n, depth: 1 }); visited.add(n); }
  }

  const ns = normalizeUrl(startUrl, origin);
  if (ns && !visited.has(ns)) { queue.unshift({ url: ns, depth: 0 }); visited.add(ns); }
  if (queue.length === 0 && ns) { queue.push({ url: ns, depth: 0 }); visited.add(ns); }

  let idx = 0;
  while (idx < queue.length && pages.length < MAX_PAGES) {
    const item = queue[idx++];
    const html = await fetchPage(item.url);
    if (!html) continue;

    const extracted = extractContent(html, item.url);
    if (!extracted) continue;

    pages.push({ url: item.url, title: extracted.title, content: extracted.content, depth: item.depth });

    if (item.depth < MAX_DEPTH) {
      for (const link of extracted.links) {
        if (!visited.has(link) && isSameDomain(link, origin)) {
          visited.add(link);
          queue.push({ url: link, depth: item.depth + 1 });
        }
      }
    }

    if (idx < queue.length && pages.length < MAX_PAGES) await sleep(DELAY_MS);
  }

  return pages;
}

// ── Store pages in Supabase ────────────────────────────────────────────────────

async function storePages(clientId: string, pages: ScrapedPage[]): Promise<number> {
  let stored = 0;
  // Insert in batches of 10
  for (let i = 0; i < pages.length; i += 10) {
    const batch = pages.slice(i, i + 10).map((p) => ({
      client_id: clientId,
      type: 'web_page',
      title: p.title,
      content: p.content,
      metadata: {
        source_url: p.url,
        scraped_at: new Date().toISOString(),
        depth: p.depth,
        word_count: p.content.split(/\s+/).length,
        status: 'completed',
      },
      source: 'scraped',
      created_by: null,
    }));

    const { data, error } = await supabase
      .from('client_knowledge_entries')
      .insert(batch)
      .select('id');

    if (error) {
      console.error(`        DB insert error: ${error.message}`);
    } else {
      stored += (data?.length ?? 0);
    }
  }
  return stored;
}

// ── Generate brand profile ─────────────────────────────────────────────────────

async function generateProfile(clientId: string, db: SupabaseClient): Promise<boolean> {
  // Fetch client data
  const { data: client } = await db
    .from('clients')
    .select('name, industry, target_audience, brand_voice, topic_keywords, website_url, description, services, preferences')
    .eq('id', clientId)
    .single();

  if (!client) return false;

  // Fetch scraped pages
  const { data: webPages } = await db
    .from('client_knowledge_entries')
    .select('id, title, content, metadata')
    .eq('client_id', clientId)
    .eq('type', 'web_page')
    .order('created_at', { ascending: false })
    .limit(15);

  const pages = webPages ?? [];
  const pageSummaries = pages.map((wp) => {
    const content = (wp.content ?? '').slice(0, 3000);
    const url = (wp.metadata as Record<string, unknown>)?.source_url ?? '';
    return `<page url="${url}">\n${content}\n</page>`;
  }).join('\n');

  // Fetch contacts & socials
  const [contactsRes, socialsRes, strategyRes] = await Promise.all([
    db.from('contacts').select('full_name, role').eq('client_id', clientId).limit(20),
    db.from('social_profiles').select('platform, username').eq('client_id', clientId),
    db.from('client_strategies').select('executive_summary, content_pillars').eq('client_id', clientId).eq('status', 'completed').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const contacts = contactsRes.data ?? [];
  const socials = socialsRes.data ?? [];
  const strategy = strategyRes.data;

  const prompt = `You are a brand strategist. Analyze all the data provided and generate a comprehensive brand profile.

<client>
  <name>${client.name ?? ''}</name>
  <industry>${client.industry ?? ''}</industry>
  <description>${client.description ?? ''}</description>
  <target_audience>${client.target_audience ?? ''}</target_audience>
  <brand_voice>${client.brand_voice ?? ''}</brand_voice>
  <topic_keywords>${JSON.stringify(client.topic_keywords ?? [])}</topic_keywords>
  <website>${client.website_url ?? ''}</website>
  <services>${JSON.stringify(client.services ?? [])}</services>
</client>

<contacts>
${contacts.map((c) => `  <person name="${c.full_name ?? ''}" role="${c.role ?? ''}" />`).join('\n')}
</contacts>

<social_profiles>
${socials.map((s) => `  <profile platform="${s.platform ?? ''}" username="${s.username ?? ''}" />`).join('\n')}
</social_profiles>

${strategy ? `<strategy>
  <summary>${(strategy.executive_summary as string) ?? ''}</summary>
  <pillars>${JSON.stringify((strategy.content_pillars as unknown) ?? [])}</pillars>
</strategy>` : ''}

<website_content>
${pageSummaries}
</website_content>

Generate a structured brand profile with these sections in markdown:

## Brand Identity
Mission, values, and market positioning.

## Products & Services
What specific products or services does this brand offer? List them with brief descriptions.

## Location & Market
Where is this business located? What markets do they serve? Include physical addresses if found.

## About Us
Company story, founding history, and any "about us" information.

## Key People
Team members, founders, leadership, or notable staff. Include names and roles.

## Voice & Tone
Communication style, vocabulary preferences, do's and don'ts for content creation.

## Visual Identity & Color Palette
Colors (list specific hex codes if visible), typography notes, imagery style and aesthetic direction.

## Target Audience
Demographics, psychographics, pain points, and aspirations.

## Content Themes
Core topics, content pillars, and seasonal or timely angles to pursue.

## Competitive Positioning
How this brand differentiates itself and its unique value proposition.

Important: Extract as much specific detail as possible — product names, team member names, locations, colors, etc.`;

  // Call OpenRouter
  const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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

  if (!aiRes.ok) {
    const err = await aiRes.text();
    console.error(`        AI API error: ${err.slice(0, 200)}`);
    return false;
  }

  const aiData = await aiRes.json();
  const profileContent = aiData.choices?.[0]?.message?.content ?? '';
  if (!profileContent) return false;

  // Supersede existing profile
  const { data: existing } = await db
    .from('client_knowledge_entries')
    .select('id')
    .eq('client_id', clientId)
    .eq('type', 'brand_profile')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    await db.from('client_knowledge_entries').update({
      metadata: { superseded_by: 'new' },
    }).eq('id', existing.id);
  }

  // Create new profile
  const { error } = await db.from('client_knowledge_entries').insert({
    client_id: clientId,
    type: 'brand_profile',
    title: `Brand profile — ${client.name ?? 'Unknown'}`,
    content: profileContent,
    metadata: { generated_from: ['client_record', 'web_pages'] },
    source: 'generated',
    created_by: null,
  });

  if (error) {
    console.error(`        Profile insert error: ${error.message}`);
    return false;
  }

  return true;
}

// ── Main ───────────────────────────────────────────────────────────────────────

interface ClientRow {
  id: string;
  name: string;
  website_url: string | null;
}

async function main() {
  console.log('Fetching active clients...\n');

  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name, website_url')
    .eq('is_active', true)
    .order('name');

  if (error || !clients) {
    console.error('Failed to fetch clients:', error?.message);
    process.exit(1);
  }

  const withWebsite = (clients as ClientRow[]).filter((c) => c.website_url);
  console.log(`Found ${withWebsite.length} clients with websites.\n`);

  // Check which already have entries
  const { data: existingEntries } = await supabase
    .from('client_knowledge_entries')
    .select('client_id')
    .in('client_id', withWebsite.map((c) => c.id))
    .eq('type', 'web_page');

  const hasEntries = new Set((existingEntries ?? []).map((e) => e.client_id));

  const results: { name: string; pages: number; profile: boolean; error?: string }[] = [];

  for (let i = 0; i < withWebsite.length; i++) {
    const client = withWebsite[i];
    const progress = `[${i + 1}/${withWebsite.length}]`;

    if (hasEntries.has(client.id)) {
      console.log(`${progress} Skipping ${client.name} (already scraped)`);
      // Still generate profile if they have pages but no profile
      const { data: profileCheck } = await supabase
        .from('client_knowledge_entries')
        .select('id')
        .eq('client_id', client.id)
        .eq('type', 'brand_profile')
        .limit(1)
        .maybeSingle();

      if (!profileCheck) {
        console.log(`        Generating brand profile...`);
        const ok = await generateProfile(client.id, supabase);
        console.log(ok ? `        Brand profile generated` : `        Profile generation failed`);
        results.push({ name: client.name, pages: 0, profile: ok });
      } else {
        results.push({ name: client.name, pages: 0, profile: true });
      }
      continue;
    }

    console.log(`${progress} Scraping ${client.name} — ${client.website_url}`);

    try {
      const pages = await scrapeClient(client.website_url!);
      console.log(`        Fetched ${pages.length} pages`);

      if (pages.length > 0) {
        const stored = await storePages(client.id, pages);
        console.log(`        Stored ${stored} entries`);

        console.log(`        Generating brand profile...`);
        const ok = await generateProfile(client.id, supabase);
        console.log(ok ? `        Brand profile generated` : `        Profile generation failed`);
        results.push({ name: client.name, pages: stored, profile: ok });
      } else {
        console.log(`        No extractable content found`);
        results.push({ name: client.name, pages: 0, profile: false });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`        Error: ${msg}`);
      results.push({ name: client.name, pages: 0, profile: false, error: msg });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  for (const r of results) {
    const status = r.error
      ? `ERROR: ${r.error.slice(0, 50)}`
      : `${r.pages} pages${r.profile ? ' + profile' : ''}`;
    console.log(`  ${r.name.padEnd(30)} ${status}`);
  }

  const totalPages = results.reduce((sum, r) => sum + r.pages, 0);
  const totalProfiles = results.filter((r) => r.profile).length;
  const totalErrors = results.filter((r) => r.error).length;

  console.log('-'.repeat(60));
  console.log(`Total: ${totalPages} pages, ${totalProfiles} profiles, ${totalErrors} errors`);
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
