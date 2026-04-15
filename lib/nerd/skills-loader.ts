/**
 * Nerd Skills Loader
 *
 * Loads skill prompt templates from the nerd_skills DB table.
 * Skills are sourced from GitHub repos (synced via API) and matched
 * to user messages by keyword overlap — same scoring approach as
 * the existing marketing-skills.ts but backed by DB instead of filesystem.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export type SkillHarness = 'admin_nerd' | 'admin_content_lab' | 'portal_content_lab';

interface DbSkill {
  id: string;
  name: string;
  description: string;
  content: string;
  keywords: string[];
  github_repo: string | null;
  github_path: string | null;
  github_branch: string | null;
  is_active: boolean;
  last_synced_at: string | null;
  harnesses: SkillHarness[];
  client_id: string | null;
  source: 'github' | 'upload';
  command_slug: string | null;
}

// In-memory cache with TTL
let cachedSkills: DbSkill[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 120_000; // 2 minutes
const MAX_SKILLS_IN_CONTEXT = 3;
const MAX_SKILL_CHARS = 6000;

/**
 * Load all active skills from DB, cached in memory. Caller filters by
 * harness + client via `matchDbSkills` / `listSkillsForHarness`.
 */
async function loadDbSkills(): Promise<DbSkill[]> {
  const now = Date.now();
  if (cachedSkills && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSkills;
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('nerd_skills')
    .select('id, name, description, content, keywords, github_repo, github_path, github_branch, is_active, last_synced_at, harnesses, client_id, source, command_slug')
    .eq('is_active', true);

  cachedSkills = (data ?? []) as DbSkill[];
  cacheTimestamp = now;
  return cachedSkills;
}

/**
 * Skills applicable to the current harness + pinned client.
 *
 * Rules:
 * - Skill must list the calling harness in its `harnesses` array.
 * - If the skill has a `client_id`, it must match the pinned client.
 *   Skills with null client_id are "agency-wide" and apply across every
 *   client in the matching harness.
 * - Admin-scope skills (admin_nerd / admin_content_lab) never leak into
 *   portal_content_lab unless explicitly listed in the harness array.
 */
export async function listSkillsForHarness(opts: {
  harness: SkillHarness;
  clientId?: string | null;
}): Promise<DbSkill[]> {
  const all = await loadDbSkills();
  return all.filter((s) => {
    if (!s.harnesses?.includes(opts.harness)) return false;
    if (s.client_id && s.client_id !== opts.clientId) return false;
    return true;
  });
}

/**
 * Match DB skills to a user message using keyword scoring.
 * Returns up to MAX_SKILLS_IN_CONTEXT skill content blocks.
 */
export async function matchDbSkills(
  userMessage: string,
  opts: { harness: SkillHarness; clientId?: string | null } = { harness: 'admin_nerd' },
): Promise<string[]> {
  const skills = await listSkillsForHarness(opts);
  if (skills.length === 0) return [];

  const queryLower = userMessage.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 3);

  const scored = skills.map((skill) => {
    let score = 0;

    // Direct name match (strongest)
    if (queryLower.includes(skill.name.replace(/-/g, ' ').toLowerCase())) score += 10;

    // Keyword match
    for (const kw of skill.keywords) {
      if (queryLower.includes(kw.toLowerCase())) score += 3;
    }

    // Query words in description
    const descLower = skill.description.toLowerCase();
    for (const word of queryWords) {
      if (descLower.includes(word)) score += 1;
    }

    return { skill, score };
  });

  const matched = scored
    .filter((s) => s.score > 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SKILLS_IN_CONTEXT);

  if (matched.length === 0) return [];

  return matched.map(({ skill }) => {
    const body = skill.content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
    const truncated = body.length > MAX_SKILL_CHARS
      ? body.slice(0, MAX_SKILL_CHARS) + '\n\n[... truncated]'
      : body;
    return `## Skill: ${skill.name}\n\n${truncated}`;
  });
}

/**
 * Build context block from matched DB skills for injection into prompts.
 *
 * Harness-aware: portal chats never receive admin-only skill context unless
 * the admin has explicitly opted-in that skill for `portal_content_lab`.
 */
export async function buildDbSkillsContext(
  userMessage: string,
  opts: { harness: SkillHarness; clientId?: string | null } = { harness: 'admin_nerd' },
): Promise<string> {
  const skills = await matchDbSkills(userMessage, opts);
  if (skills.length === 0) return '';
  return `\n\n---\n\nAGENCY SKILLS (use these frameworks to give expert advice):\n\n${skills.join('\n\n---\n\n')}`;
}

/**
 * Sync a skill from its GitHub repo. Fetches the raw file content.
 * Returns the fetched content or throws on failure.
 */
export async function syncSkillFromGitHub(
  repo: string,
  path: string,
  branch: string,
): Promise<string> {
  // Use raw.githubusercontent.com for public repos
  const url = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'text/plain' },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  return res.text();
}

/**
 * Extract keywords from skill content (frontmatter description + body headings).
 */
export function extractKeywords(content: string, manualKeywords: string[] = []): string[] {
  const stopWords = new Set([
    'when', 'user', 'wants', 'also', 'this', 'that', 'with', 'from', 'your',
    'have', 'they', 'their', 'about', 'what', 'does', 'more', 'like', 'such',
    'into', 'than', 'been', 'just', 'only', 'will', 'should', 'could', 'would',
    'using', 'these', 'those', 'other', 'each', 'some', 'help', 'make', 'very',
    'well', 'here', 'then', 'because', 'after', 'before', 'which', 'while',
  ]);

  // Extract from frontmatter description
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  let descriptionText = '';
  if (fmMatch) {
    const descMatch = fmMatch[1].match(/description:\s*([\s\S]*?)(?:\n[a-z]|\n---)/);
    descriptionText = descMatch?.[1]?.trim() ?? '';
  }

  // Extract from markdown headings
  const headings = content.match(/^#+\s+(.+)/gm) ?? [];
  const headingText = headings.map((h) => h.replace(/^#+\s+/, '')).join(' ');

  const allText = `${descriptionText} ${headingText}`.toLowerCase();
  const words = allText
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));

  const unique = [...new Set([...manualKeywords.map((k) => k.toLowerCase()), ...words])];
  return unique;
}

/** Invalidate the cached skills (call after CRUD operations). */
export function invalidateSkillsCache(): void {
  cachedSkills = null;
  cacheTimestamp = 0;
}
