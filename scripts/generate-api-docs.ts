#!/usr/bin/env tsx
/**
 * Scan every route.ts under app/api and emit a fresh
 * app/admin/nerd/api/api-docs-data.ts catalog driven by what actually
 * exists on disk (with JSDoc-supplied descriptions where routes have
 * them). Run with: `npx tsx scripts/generate-api-docs.ts`.
 *
 * The old catalog was manually curated and drifted badly; this file
 * makes the filesystem the source of truth. To document a new route,
 * write a JSDoc block above the HTTP-method export:
 *
 *   /**
 *    * POST /api/foo/bar
 *    * Short description on this line or the next.
 *    * @auth API key / Bearer session
 *    * @body name - string (required)
 *    * @returns {{ id }}
 *    *\/
 *   export async function POST(req: NextRequest) { ... }
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const API_ROOT = join(process.cwd(), 'app/api');
const OUTPUT = join(process.cwd(), 'app/admin/nerd/api/api-docs-data.ts');
const MARKDOWN_OUTPUT = join(process.cwd(), 'docs/api-reference.md');

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
const METHODS: Method[] = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];

interface Endpoint {
  method: Method;
  path: string;
  description: string;
  auth: string;
  section: string;
  sectionSlug: string;
  body?: string;
  query?: string;
  response?: string;
  useWhen?: string;
}

interface Section {
  slug: string;
  title: string;
  icon: string;
  description: string;
}

// Section taxonomy — stable identifiers + display metadata. Auto-assigned
// by top-level path segment; add new sections here if you carve out new
// top-level namespaces under app/api.
const SECTIONS: Section[] = [
  { slug: 'auth', title: 'Auth & Account', icon: 'Shield', description: 'Authentication, session, profile, avatar upload, impersonation.' },
  { slug: 'api-keys', title: 'API Keys', icon: 'Key', description: 'Create, list, and revoke API keys for external access.' },
  { slug: 'search', title: 'Search & Research', icon: 'Search', description: 'Topic research pipeline — start searches, process results, share findings.' },
  { slug: 'clients', title: 'Clients & Onboarding', icon: 'Building2', description: 'Client CRUD, onboarding, URL analysis, contacts, assignments.' },
  { slug: 'knowledge', title: 'Knowledge Base', icon: 'Brain', description: 'Knowledge entries, semantic search, website scraping, meeting imports.' },
  { slug: 'ideas', title: 'Ideas & Content', icon: 'Lightbulb', description: 'Video idea generation, scripts, concepts, moodboards.' },
  { slug: 'reference-videos', title: 'Reference Videos', icon: 'Video', description: 'Reference video uploads + processing for AI analysis.' },
  { slug: 'tasks', title: 'Tasks & Todos', icon: 'CheckSquare', description: 'Task management, search, natural-language parsing.' },
  { slug: 'pipeline', title: 'Pipeline', icon: 'GitBranch', description: 'Content production pipeline — status, advancement, assignments.' },
  { slug: 'shoots', title: 'Shoots & Calendar', icon: 'Camera', description: 'Shoot scheduling, planning, Google Calendar integration.' },
  { slug: 'ad-creatives', title: 'Ad Creatives', icon: 'ImagePlus', description: 'AI ad creative generation + template management.' },
  { slug: 'analyze', title: 'Analyze', icon: 'Microscope', description: 'Video analysis boards, AI insights, scripts, PDFs, chat.' },
  { slug: 'analyze-social', title: 'Organic Social', icon: 'Users', description: 'Organic social audits + share links.' },
  { slug: 'analytics', title: 'Analytics', icon: 'BarChart3', description: 'Social analytics, benchmarking, competitors, ecom tracking.' },
  { slug: 'nerd', title: 'The Nerd AI', icon: 'Bot', description: 'AI assistant with tool-calling + @mention context.' },
  { slug: 'scheduler', title: 'Scheduler', icon: 'Calendar', description: 'Social media scheduling, publishing, captions, reviews.' },
  { slug: 'reporting', title: 'Reporting', icon: 'BarChart3', description: 'Reports, digests, top posts, Instagram insights, ads, affiliates.' },
  { slug: 'google', title: 'Google Workspace', icon: 'Globe', description: 'Google Calendar, Drive, Chat, and OAuth connections.' },
  { slug: 'team', title: 'Team & Meetings', icon: 'Users', description: 'Team members, workload, meetings.' },
  { slug: 'notifications', title: 'Notifications', icon: 'Bell', description: 'Notification management and broadcast updates.' },
  { slug: 'vault', title: 'Vault', icon: 'Database', description: 'Obsidian vault — search, indexing, file read/write, webhooks.' },
  { slug: 'dashboard', title: 'Dashboard', icon: 'LayoutDashboard', description: 'Dashboard stats, overview, activity, AI usage, health.' },
  { slug: 'invites', title: 'Portal Invites', icon: 'UserPlus', description: 'Client portal invite generation, validation, acceptance.' },
  { slug: 'settings', title: 'Settings', icon: 'Settings', description: 'Account and workspace preferences.' },
  { slug: 'portal', title: 'Portal', icon: 'ExternalLink', description: 'Client-portal-specific endpoints.' },
  { slug: 'admin', title: 'Admin Ops', icon: 'ShieldCheck', description: 'Admin-only ops: backfills, migrations, diagnostics.' },
  { slug: 'shared', title: 'Shared Links', icon: 'Share2', description: 'Public/shared-link endpoints (auth via token).' },
  { slug: 'presentations', title: 'Presentations', icon: 'Presentation', description: 'Client-facing presentation viewer + data.' },
  { slug: 'monday', title: 'Monday.com', icon: 'Workflow', description: 'Monday.com webhooks, sync, board updates.' },
  { slug: 'todoist', title: 'Todoist', icon: 'ListTodo', description: 'Todoist connection and bidirectional task sync.' },
  { slug: 'v1', title: 'External API (v1)', icon: 'Plug', description: 'API key-authenticated endpoints for external agents and scripts.' },
  { slug: 'cron', title: 'Cron Jobs', icon: 'Clock', description: 'Internal scheduled jobs for sync, publishing, monitoring.' },
  { slug: 'other', title: 'Other', icon: 'MoreHorizontal', description: 'Uncategorized routes.' },
];

// Explicit path-prefix → section-slug overrides. Apply before the default
// `first segment == section.slug` lookup. Keeps the SECTIONS list short
// without proliferating near-duplicate slugs.
const PATH_ALIASES: Record<string, string> = {
  account: 'auth',
  impersonate: 'auth',
  accounting: 'admin',
  activity: 'dashboard',
  'ad-creatives-v2': 'ad-creatives',
  affiliates: 'reporting',
  analysis: 'analyze',
  benchmarks: 'analytics',
  'ecom-competitors': 'analytics',
  'meta-ad-tracker': 'analytics',
  insights: 'reporting',
  instagram: 'reporting',
  social: 'reporting',
  'production-updates': 'notifications',
  calendar: 'shoots',
  concepts: 'ideas',
  moodboard: 'ideas',
  'topic-plans': 'search',
  history: 'search',
  research: 'search',
  meetings: 'team',
  todos: 'tasks',
  usage: 'dashboard',
  health: 'dashboard',
  'submit-payroll': 'admin',
};

function sectionForPath(apiPath: string): Section {
  const parts = apiPath.replace(/^\/api\//, '').split('/');
  const first = parts[0] ?? '';
  const slug = PATH_ALIASES[first] ?? first;
  return SECTIONS.find((s) => s.slug === slug) ?? SECTIONS[SECTIONS.length - 1];
}

async function* walkRouteFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkRouteFiles(full);
    else if (entry.name === 'route.ts' || entry.name === 'route.tsx') yield full;
  }
}

function fsPathToApiPath(filePath: string): string {
  const rel = relative(API_ROOT, filePath).replace(/\\/g, '/');
  const withoutRoute = rel.replace(/\/route\.tsx?$/, '');
  const expressy = withoutRoute.replace(/\[\.\.\.(\w+)\]/g, ':$1*').replace(/\[(\w+)\]/g, ':$1');
  return `/api/${expressy}`;
}

/**
 * Parse the text of a route file and return one Endpoint per exported HTTP method.
 */
function parseRouteFile(apiPath: string, text: string): Endpoint[] {
  const section = sectionForPath(apiPath);
  const endpoints: Endpoint[] = [];
  const seen = new Set<Method>();

  // Walk JSDoc blocks that sit right above an HTTP-method export.
  const blockRe = /\/\*\*([\s\S]*?)\*\/\s*export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b/g;
  for (const match of text.matchAll(blockRe)) {
    const raw = match[1];
    const method = match[2] as Method;
    if (seen.has(method)) continue;
    seen.add(method);
    endpoints.push(endpointFromJsDoc(apiPath, section, method, raw));
  }

  // Pick up any HTTP-method exports that lacked a JSDoc block above them.
  const exportRe = /export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b/g;
  for (const match of text.matchAll(exportRe)) {
    const method = match[1] as Method;
    if (seen.has(method)) continue;
    seen.add(method);
    endpoints.push({
      method,
      path: apiPath,
      description: '',
      auth: '',
      section: section.title,
      sectionSlug: section.slug,
    });
  }

  return endpoints;
}

function endpointFromJsDoc(
  apiPath: string,
  section: Section,
  method: Method,
  rawBlock: string,
): Endpoint {
  const lines = rawBlock
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trimEnd());

  // Trim leading / trailing empty lines.
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines[lines.length - 1] === '') lines.pop();

  const descLines: string[] = [];
  const body: string[] = [];
  const query: string[] = [];
  const response: string[] = [];
  let auth = '';
  let useWhen = '';

  let mode: 'desc' | 'body' | 'query' | 'response' | 'useWhen' | null = 'desc';
  for (const line of lines) {
    const tag = line.match(/^@(\w+)\s*(.*)$/);
    if (tag) {
      const [, name, rest] = tag;
      switch (name) {
        case 'body':
          body.push(rest);
          mode = 'body';
          break;
        case 'query':
        case 'param':
          query.push(rest);
          mode = 'query';
          break;
        case 'returns':
        case 'response':
          response.push(rest);
          mode = 'response';
          break;
        case 'auth':
          auth = rest.trim();
          mode = null;
          break;
        case 'useWhen':
        case 'usewhen':
          useWhen = rest.trim();
          mode = 'useWhen';
          break;
        default:
          mode = null;
      }
      continue;
    }

    // First line may be "METHOD /api/path" — skip it.
    if (mode === 'desc' && descLines.length === 0 && /^(GET|POST|PATCH|PUT|DELETE)\s+\/api\//.test(line)) continue;

    switch (mode) {
      case 'desc':
        descLines.push(line);
        break;
      case 'body':
        if (line && body.length) body[body.length - 1] += '\n' + line;
        break;
      case 'query':
        if (line && query.length) query[query.length - 1] += '\n' + line;
        break;
      case 'response':
        if (line && response.length) response[response.length - 1] += '\n' + line;
        break;
      case 'useWhen':
        if (line) useWhen += (useWhen ? '\n' : '') + line;
        break;
      default:
        break;
    }
  }

  const description = descLines.join(' ').replace(/\s+/g, ' ').trim();

  return {
    method,
    path: apiPath,
    description,
    auth,
    section: section.title,
    sectionSlug: section.slug,
    body: body.length ? body.join('\n').trim() : undefined,
    query: query.length ? query.join('\n').trim() : undefined,
    response: response.length ? response.join('\n').trim() : undefined,
    useWhen: useWhen || undefined,
  };
}

function emit(endpoints: Endpoint[]): string {
  const header = `// AUTO-GENERATED by scripts/generate-api-docs.ts — do not edit by hand.
// Run \`npx tsx scripts/generate-api-docs.ts\` after adding or removing routes
// (or changing the JSDoc block above an exported HTTP method).

export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  auth: string;
  section: string;
  sectionSlug: string;
  body?: string;
  query?: string;
  response?: string;
  useWhen?: string;
}

export interface ApiSection {
  slug: string;
  title: string;
  icon: string;
  description: string;
}
`;

  const sectionsLit = 'export const API_SECTIONS: ApiSection[] = ' + JSON.stringify(SECTIONS, null, 2) + ';\n';

  const sectionTitles = SECTIONS.map((s) => JSON.stringify(s.title)).join(',\n  ');
  const sectionsLegacy = `\nexport const SECTIONS = [\n  ${sectionTitles},\n] as const;\n`;

  const endpointsLit = 'export const API_ENDPOINTS: ApiEndpoint[] = ' + JSON.stringify(endpoints, null, 2) + ';\n';

  return header + '\n' + sectionsLit + sectionsLegacy + '\n' + endpointsLit;
}

function emitMarkdown(endpoints: Endpoint[]): string {
  const bySection = new Map<string, Endpoint[]>();
  for (const e of endpoints) {
    const list = bySection.get(e.sectionSlug);
    if (list) list.push(e);
    else bySection.set(e.sectionSlug, [e]);
  }

  const out: string[] = [];
  out.push('# Nativz Cortex — API Reference');
  out.push('');
  out.push('> **For AI agents:** This document describes every API endpoint that exists on disk. Auto-generated from `app/api/**/route.ts` by `scripts/generate-api-docs.ts` — do not edit by hand. Re-run the script after adding/removing routes or tweaking a JSDoc block.');
  out.push('');
  out.push(`**${endpoints.length} endpoints across ${bySection.size} sections.**`);
  out.push('');
  out.push('## Authentication');
  out.push('');
  out.push('Three distinct auth patterns are used:');
  out.push('');
  out.push('- **Supabase session cookie** — the default for admin + portal routes. Read via `createServerSupabaseClient()` / `supabase.auth.getUser()`.');
  out.push('- **API key (Bearer token)** — `/api/v1/*` and other external-agent endpoints. Validated via `validateApiKey(request)`.');
  out.push('- **Shared-link token** — `/api/shared/*` and read-only public surfaces. Token is in the path.');
  out.push('');
  out.push('---');
  out.push('');

  for (const section of SECTIONS) {
    const items = bySection.get(section.slug);
    if (!items || items.length === 0) continue;
    out.push(`## ${section.title}`);
    out.push('');
    out.push(`_${section.description}_`);
    out.push('');
    for (const ep of items) {
      out.push(`### \`${ep.method} ${ep.path}\``);
      out.push('');
      if (ep.description) {
        out.push(ep.description);
        out.push('');
      }
      if (ep.auth) {
        out.push(`**Auth:** ${ep.auth}`);
        out.push('');
      }
      if (ep.body) {
        out.push('**Body:**');
        out.push('');
        out.push('```');
        out.push(ep.body);
        out.push('```');
        out.push('');
      }
      if (ep.query) {
        out.push('**Query params:**');
        out.push('');
        out.push('```');
        out.push(ep.query);
        out.push('```');
        out.push('');
      }
      if (ep.response) {
        out.push('**Returns:**');
        out.push('');
        out.push('```');
        out.push(ep.response);
        out.push('```');
        out.push('');
      }
      if (ep.useWhen) {
        out.push(`**Use when:** ${ep.useWhen}`);
        out.push('');
      }
    }
    out.push('---');
    out.push('');
  }

  return out.join('\n');
}

async function main() {
  const endpoints: Endpoint[] = [];
  for await (const file of walkRouteFiles(API_ROOT)) {
    const apiPath = fsPathToApiPath(file);
    const text = await readFile(file, 'utf8');
    endpoints.push(...parseRouteFile(apiPath, text));
  }

  endpoints.sort((a, b) =>
    a.sectionSlug.localeCompare(b.sectionSlug) ||
    a.path.localeCompare(b.path) ||
    a.method.localeCompare(b.method),
  );

  await writeFile(OUTPUT, emit(endpoints));
  await writeFile(MARKDOWN_OUTPUT, emitMarkdown(endpoints));
  const bySection = new Map<string, number>();
  for (const e of endpoints) bySection.set(e.sectionSlug, (bySection.get(e.sectionSlug) ?? 0) + 1);
  console.log(`Wrote ${endpoints.length} endpoints across ${bySection.size} sections`);
  console.log(`  → ${OUTPUT}`);
  console.log(`  → ${MARKDOWN_OUTPUT}`);
  for (const [slug, n] of [...bySection.entries()].sort()) {
    console.log(`  ${slug.padEnd(20)} ${n}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
