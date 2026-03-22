/**
 * Minimal robots.txt handling for Brand DNA crawling: matching User-agent blocks,
 * Allow/Disallow longest-prefix wins (common bot behavior), and Crawl-delay.
 */

const BOT_NAMES = new Set(['nativzbot', '*']);

type Rule = { kind: 'allow' | 'disallow'; path: string };

export type AgentBlock = { agents: string[]; rules: Rule[]; crawlDelaySec: number | null };

function stripComment(line: string): string {
  const i = line.indexOf('#');
  return (i >= 0 ? line.slice(0, i) : line).trim();
}

/** Parse robots.txt into agent blocks (consecutive User-agent lines share one rule set). */
export function parseRobotsTxtIntoBlocks(text: string): AgentBlock[] {
  const blocks: AgentBlock[] = [];
  let currentAgents: string[] = [];
  let currentRules: Rule[] = [];
  let crawlDelaySec: number | null = null;

  const flush = () => {
    if (currentAgents.length > 0) {
      blocks.push({
        agents: [...currentAgents],
        rules: [...currentRules],
        crawlDelaySec,
      });
    }
    currentAgents = [];
    currentRules = [];
    crawlDelaySec = null;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw);
    if (!line) continue;
    const lower = line.toLowerCase();
    if (lower.startsWith('user-agent:')) {
      const name = line.slice('user-agent:'.length).trim().toLowerCase();
      if (!name) continue;
      if (currentAgents.length > 0 && (currentRules.length > 0 || crawlDelaySec !== null)) {
        flush();
      }
      if (currentAgents.length > 0 && currentRules.length === 0 && crawlDelaySec === null) {
        currentAgents.push(name);
      } else {
        currentAgents = [name];
      }
      continue;
    }
    if (currentAgents.length === 0) continue;
    if (lower.startsWith('disallow:')) {
      currentRules.push({ kind: 'disallow', path: line.slice('disallow:'.length).trim() });
    } else if (lower.startsWith('allow:')) {
      currentRules.push({ kind: 'allow', path: line.slice('allow:'.length).trim() });
    } else if (lower.startsWith('crawl-delay:')) {
      const v = parseFloat(line.slice('crawl-delay:'.length).trim());
      if (!Number.isNaN(v) && v >= 0 && v < 120) {
        crawlDelaySec = crawlDelaySec === null ? v : Math.max(crawlDelaySec, v);
      }
    }
  }
  flush();
  return blocks;
}

function tryDecodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** Whether a pathname is covered by a single Allow/Disallow pattern (no * wildcards). */
export function robotsPatternMatches(pathname: string, pattern: string): boolean {
  const p = tryDecodePath(pattern.trim());
  if (p === '') return false;
  if (p === '/') return pathname.startsWith('/');
  const base = p.endsWith('/') ? p.slice(0, -1) : p;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Longest matching rule wins. Empty disallow is a no-op; disallow `/` blocks the whole site.
 * If no rule matches, URL is allowed.
 */
export function pathnameAllowedByRules(pathname: string, rules: Rule[]): boolean {
  let bestLen = -1;
  let bestAllow = true;

  for (const r of rules) {
    const raw = r.path.trim();
    if (r.kind === 'disallow' && raw === '') continue;
    if (!robotsPatternMatches(pathname, raw)) continue;
    const len = raw.length;
    if (len > bestLen) {
      bestLen = len;
      bestAllow = r.kind === 'allow';
    }
  }

  if (bestLen < 0) return true;
  return bestAllow;
}

function rulesForOurBots(blocks: AgentBlock[]): Rule[] {
  const out: Rule[] = [];
  for (const b of blocks) {
    const hit = b.agents.some((a) => BOT_NAMES.has(a));
    if (hit) out.push(...b.rules);
  }
  return out;
}

function maxCrawlDelayForOurBots(blocks: AgentBlock[]): number | null {
  let best: number | null = null;
  for (const b of blocks) {
    if (!b.agents.some((a) => BOT_NAMES.has(a))) continue;
    if (b.crawlDelaySec == null) continue;
    best = best === null ? b.crawlDelaySec : Math.max(best, b.crawlDelaySec);
  }
  return best;
}

export interface RobotsPolicy {
  isPathAllowed(pathname: string): boolean;
  /** Minimum gap between requests to this host (ms), from Crawl-delay or default. */
  minIntervalMs: number;
}

const DEFAULT_MIN_INTERVAL_MS = 400;

export function buildRobotsPolicy(robotsBody: string | null): RobotsPolicy {
  if (!robotsBody?.trim()) {
    return {
      isPathAllowed: () => true,
      minIntervalMs: DEFAULT_MIN_INTERVAL_MS,
    };
  }

  const blocks = parseRobotsTxtIntoBlocks(robotsBody);
  const rules = rulesForOurBots(blocks);
  const delaySec = maxCrawlDelayForOurBots(blocks);
  const minIntervalMs =
    delaySec != null
      ? Math.min(10_000, Math.max(DEFAULT_MIN_INTERVAL_MS, delaySec * 1000))
      : DEFAULT_MIN_INTERVAL_MS;

  return {
    isPathAllowed: (pathname: string) => pathnameAllowedByRules(pathname, rules),
    minIntervalMs,
  };
}
