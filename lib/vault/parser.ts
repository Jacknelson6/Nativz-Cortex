/**
 * Parses Obsidian vault markdown files back into structured data
 * for syncing vault → Supabase.
 */

// ---------------------------------------------------------------------------
// YAML frontmatter parser
// ---------------------------------------------------------------------------

interface VaultFrontmatter {
  type?: string;
  client?: string;
  abbreviation?: string;
  agency?: string;
  industry?: string;
  website?: string;
  services?: string[];
  updated?: string;
  monday_synced?: boolean;
  [key: string]: unknown;
}

function parseFrontmatter(raw: string): { frontmatter: VaultFrontmatter; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };

  const fmBlock = match[1];
  const body = match[2];
  const fm: VaultFrontmatter = {};

  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of fmBlock.split('\n')) {
    // Key: value pair
    const kvMatch = line.match(/^(\w[\w_]*?):\s*(.*)$/);
    if (kvMatch) {
      // Save previous array if any
      if (currentKey && currentArray) {
        fm[currentKey] = currentArray;
        currentArray = null;
      }

      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();

      if (val === '') {
        // Start of array
        currentArray = [];
      } else if (val === 'true') {
        fm[currentKey] = true;
        currentKey = null;
      } else if (val === 'false') {
        fm[currentKey] = false;
        currentKey = null;
      } else {
        // Strip surrounding quotes
        fm[currentKey] = val.replace(/^["']|["']$/g, '');
        currentKey = null;
      }
    } else if (currentArray !== null && line.match(/^\s+-\s/)) {
      const item = line.replace(/^\s+-\s*/, '').replace(/^["']|["']$/g, '');
      currentArray.push(item);
    }
  }

  // Save trailing array
  if (currentKey && currentArray) {
    fm[currentKey] = currentArray;
  }

  return { frontmatter: fm, body };
}

// ---------------------------------------------------------------------------
// Markdown section extractor
// ---------------------------------------------------------------------------

function extractSection(body: string, heading: string): string | null {
  // Match ## heading followed by content until next ## or end
  const regex = new RegExp(
    `## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`,
    'i',
  );
  const match = body.match(regex);
  if (!match) return null;
  const content = match[1].trim();
  return content || null;
}

function extractListItems(body: string, heading: string): string[] {
  const section = extractSection(body, heading);
  if (!section) return [];
  return section
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^-\s*/, '').trim());
}

function extractWebsite(body: string): string | null {
  const match = body.match(/\*\*Website:\*\*\s*(https?:\/\/\S+)/);
  return match ? match[1] : null;
}

function extractPointOfContact(body: string): { name: string; email: string } | null {
  const section = extractSection(body, 'Point of contact');
  if (!section) return null;
  const match = section.match(/-\s*(.+?)\s*<(.+?)>/);
  if (!match) return null;
  return { name: match[1].trim(), email: match[2].trim() };
}

// ---------------------------------------------------------------------------
// Client profile parser
// ---------------------------------------------------------------------------

export interface ParsedClientProfile {
  name: string;
  slug: string;
  industry: string;
  abbreviation?: string;
  website_url?: string;
  target_audience?: string;
  brand_voice?: string;
  topic_keywords: string[];
  services: string[];
  agency?: string;
  point_of_contact?: { name: string; email: string };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseClientProfile(markdown: string): ParsedClientProfile | null {
  const { frontmatter: fm, body } = parseFrontmatter(markdown);

  if (fm.type !== 'client-profile') return null;

  const name = fm.client as string;
  if (!name) return null;

  // Industry: from frontmatter if available, otherwise derive from target audience
  let industry = (fm.industry as string) || '';
  if (!industry || industry === 'null') {
    industry = 'General';
  }

  return {
    name,
    slug: slugify(name),
    industry,
    abbreviation: fm.abbreviation as string | undefined,
    website_url: (fm.website as string) || extractWebsite(body) || undefined,
    target_audience: extractSection(body, 'Target audience') || undefined,
    brand_voice: extractSection(body, 'Brand voice') || undefined,
    topic_keywords: extractListItems(body, 'Topic keywords'),
    services: (fm.services as string[]) || extractListItems(body, 'Services'),
    agency: (fm.agency as string) || undefined,
    point_of_contact: extractPointOfContact(body) || undefined,
  };
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

export { parseFrontmatter, extractSection, extractListItems };
