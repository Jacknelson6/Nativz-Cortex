/**
 * Marketing skills loader for The Nerd and Content Lab agents.
 * Reads SKILL.md files from .agents/skills/ and matches relevant ones
 * based on the user's query keywords.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

interface SkillEntry {
  name: string;
  description: string;
  /** Keywords extracted from the description for matching */
  keywords: string[];
  /** Full path to SKILL.md */
  path: string;
}

const SKILLS_DIR = join(process.cwd(), '.agents', 'skills');
const MAX_SKILLS_IN_CONTEXT = 3;
const MAX_SKILL_CHARS = 6000;

let cachedSkills: SkillEntry[] | null = null;

/**
 * Load all skill metadata from .agents/skills/. Cached in memory.
 */
function loadSkillIndex(): SkillEntry[] {
  if (cachedSkills) return cachedSkills;

  if (!existsSync(SKILLS_DIR)) {
    cachedSkills = [];
    return [];
  }

  const entries: SkillEntry[] = [];
  const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const dir of dirs) {
    const skillPath = join(SKILLS_DIR, dir.name, 'SKILL.md');
    if (!existsSync(skillPath)) continue;

    try {
      const content = readFileSync(skillPath, 'utf-8');
      // Extract description from frontmatter
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;

      const fm = fmMatch[1];
      const descMatch = fm.match(/description:\s*([\s\S]*?)(?:\n[a-z]|\n---)/);

      const description = descMatch?.[1]?.trim() ?? '';

      // Build keywords from the description
      const keywords = description
        .toLowerCase()
        .replace(/['"`,\.\(\)]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .filter((w) => !['when', 'user', 'wants', 'also', 'this', 'that', 'with', 'from', 'your', 'have', 'they', 'their', 'about', 'what', 'does', 'more', 'like', 'such', 'into', 'than', 'been', 'just', 'only', 'will', 'should', 'could', 'would', 'using', 'these', 'those', 'other', 'each', 'some', 'help', 'make', 'very', 'well', 'here'].includes(w));

      entries.push({
        name: dir.name,
        description,
        keywords: [...new Set(keywords)],
        path: skillPath,
      });
    } catch {
      // Skip malformed skills
    }
  }

  cachedSkills = entries;
  return entries;
}

/**
 * Given a user message, find the most relevant marketing skills.
 * Returns up to MAX_SKILLS_IN_CONTEXT skill contents.
 */
export function matchMarketingSkills(userMessage: string): string[] {
  const skills = loadSkillIndex();
  if (skills.length === 0) return [];

  const queryLower = userMessage.toLowerCase();
  const queryWords = queryLower.split(/\s+/);

  // Score each skill by keyword overlap
  const scored = skills.map((skill) => {
    let score = 0;

    // Direct name match (strongest signal)
    if (queryLower.includes(skill.name.replace(/-/g, ' '))) score += 10;

    // Keyword overlap
    for (const kw of skill.keywords) {
      if (queryLower.includes(kw)) score += 2;
    }

    // Query word matches in description
    for (const word of queryWords) {
      if (word.length > 4 && skill.description.toLowerCase().includes(word)) score += 1;
    }

    return { skill, score };
  });

  // Filter to skills with any match, sort by score descending
  const matched = scored
    .filter((s) => s.score > 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SKILLS_IN_CONTEXT);

  if (matched.length === 0) return [];

  // Read the full skill content for matched skills
  return matched.map(({ skill }) => {
    try {
      const content = readFileSync(skill.path, 'utf-8');
      // Strip frontmatter
      const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
      const truncated = body.length > MAX_SKILL_CHARS
        ? body.slice(0, MAX_SKILL_CHARS) + '\n\n[... truncated]'
        : body;
      return `## Marketing Skill: ${skill.name}\n\n${truncated}`;
    } catch {
      return '';
    }
  }).filter(Boolean);
}

/**
 * Build a context block of matched marketing skills for injection into system prompts.
 * Returns empty string if no skills match.
 */
export function buildMarketingSkillsContext(userMessage: string): string {
  const skills = matchMarketingSkills(userMessage);
  if (skills.length === 0) return '';

  return `\n\n---\n\nMARKETING EXPERTISE (use these frameworks to give expert advice):\n\n${skills.join('\n\n---\n\n')}`;
}
