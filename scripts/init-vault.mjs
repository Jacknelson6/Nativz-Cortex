/**
 * Standalone script to initialize the Obsidian vault via GitHub API.
 * Run: node scripts/init-vault.mjs
 */

// Load from .env.local if available (run from project root)
import { readFileSync } from 'fs';
try {
  const envFile = readFileSync('.env.local', 'utf-8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch { /* no .env.local */ }

const GITHUB_TOKEN = process.env.GITHUB_VAULT_TOKEN;
const GITHUB_REPO = process.env.GITHUB_VAULT_REPO;
const GITHUB_BRANCH = process.env.GITHUB_VAULT_BRANCH || 'main';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GITHUB_TOKEN || !GITHUB_REPO) {
  console.error('Missing GITHUB_VAULT_TOKEN or GITHUB_VAULT_REPO. Set in .env.local or environment.');
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set in .env.local or environment.');
  process.exit(1);
}

const BASE = 'https://api.github.com';
const hdrs = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
};

function encodePath(p) {
  return p.split('/').map(s => encodeURIComponent(s)).join('/');
}

async function readFile(path) {
  const res = await fetch(`${BASE}/repos/${GITHUB_REPO}/contents/${encodePath(path)}?ref=${GITHUB_BRANCH}`, {
    headers: hdrs,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Read failed: ${res.status}`);
  const d = await res.json();
  return { content: Buffer.from(d.content, 'base64').toString('utf-8'), sha: d.sha };
}

async function fileExists(path) {
  const res = await fetch(`${BASE}/repos/${GITHUB_REPO}/contents/${encodePath(path)}?ref=${GITHUB_BRANCH}`, {
    method: 'HEAD',
    headers: hdrs,
  });
  return res.ok;
}

async function writeFile(path, content, message) {
  let sha;
  const existing = await readFile(path);
  if (existing) sha = existing.sha;

  const body = {
    message,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch: GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;

  const res = await fetch(`${BASE}/repos/${GITHUB_REPO}/contents/${encodePath(path)}`, {
    method: 'PUT',
    headers: hdrs,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Write failed (${res.status}): ${t}`);
  }
  console.log(`  Created: ${path}`);
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const templates = {
  'Templates/research-report.md': `---
type: research
client: ""
query: ""
date: ""
search_mode: ""
status: ""
cortex_id: ""
---

# {{query}}

> {{search_mode}} — {{date}}

## Executive summary

## Trending topics

## Video ideas
`,
  'Templates/idea.md': `---
type: idea
client: ""
category: ""
status: new
cortex_id: ""
created: ""
---

# {{title}}

## Description

## Source
`,
  'Templates/client-profile.md': `---
type: client-profile
client: ""
industry: ""
website: ""
updated: ""
---

# {{client_name}}

> {{industry}}

## Target audience

## Brand voice

## Topic keywords

## Tone keywords

## Topics to lean into

## Topics to avoid

## Competitors

## Seasonal priorities
`,
  'Templates/shoot-prep.md': `---
type: shoot-prep
client: ""
date: ""
location: ""
crew: []
---

# Shoot prep — {{client}} — {{date}}

## Objective

## Key topics to cover
- [ ] Topic 1
- [ ] Topic 2

## Shot list
- [ ] Shot 1
- [ ] Shot 2

## Research references

## Notes
`,
  'Templates/meeting-prep.md': `---
type: meeting-prep
client: ""
date: ""
attendees: []
---

# Meeting prep — {{client}} — {{date}}

## Agenda
1.
2.
3.

## Key updates

## Research highlights

## Action items
- [ ] Item 1
- [ ] Item 2
`,
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Initializing Nativz Vault...\n');

  // 1. Create templates
  console.log('Step 1: Creating templates...');
  for (const [path, content] of Object.entries(templates)) {
    const exists = await fileExists(path);
    if (!exists) {
      await writeFile(path, content, `init: ${path}`);
    } else {
      console.log(`  Exists: ${path}`);
    }
  }

  // 2. Fetch clients from Supabase
  console.log('\nStep 2: Syncing client profiles from Supabase...');
  const clientsRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?is_active=eq.true&order=name`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!clientsRes.ok) {
    console.error('Failed to fetch clients:', clientsRes.status, await clientsRes.text());
    return;
  }

  const clients = await clientsRes.json();
  console.log(`  Found ${clients.length} active client(s)`);

  // 3. Create client profiles
  for (const c of clients) {
    const fmLines = [
      '---',
      `type: "client-profile"`,
      `client: ${JSON.stringify(c.name)}`,
      `industry: ${JSON.stringify(c.industry)}`,
    ];
    if (c.website_url) fmLines.push(`website: ${JSON.stringify(c.website_url)}`);
    fmLines.push(`updated: "${new Date().toISOString().split('T')[0]}"`);
    fmLines.push('---');
    const fm = fmLines.join('\n');

    const sections = [fm, '', `# ${c.name}`, '', `> ${c.industry}`, ''];

    if (c.website_url) sections.push(`**Website:** ${c.website_url}`, '');
    if (c.target_audience) sections.push('## Target audience', '', c.target_audience, '');
    if (c.brand_voice) sections.push('## Brand voice', '', c.brand_voice, '');
    if (c.topic_keywords?.length) {
      sections.push('## Topic keywords', '', c.topic_keywords.map(k => `- ${k}`).join('\n'), '');
    }

    const p = c.preferences;
    if (p) {
      if (p.tone_keywords?.length) sections.push('## Tone keywords', '', p.tone_keywords.map(k => `- ${k}`).join('\n'), '');
      if (p.topics_lean_into?.length) sections.push('## Topics to lean into', '', p.topics_lean_into.map(k => `- ${k}`).join('\n'), '');
      if (p.topics_avoid?.length) sections.push('## Topics to avoid', '', p.topics_avoid.map(k => `- ${k}`).join('\n'), '');
      if (p.competitor_accounts?.length) sections.push('## Competitors', '', p.competitor_accounts.map(k => `- ${k}`).join('\n'), '');
      if (p.seasonal_priorities?.length) sections.push('## Seasonal priorities', '', p.seasonal_priorities.map(k => `- ${k}`).join('\n'), '');
    }

    const md = sections.join('\n');
    const path = `Clients/${c.name}/_profile.md`;
    await writeFile(path, md, `profile: ${c.name}`);
  }

  // 4. Create Dashboard MOC
  console.log('\nStep 3: Creating Dashboard MOC...');
  const dashFm = [
    '---',
    `type: "dashboard"`,
    `updated: "${new Date().toISOString().split('T')[0]}"`,
    '---',
  ].join('\n');

  const dashSections = [
    dashFm,
    '',
    '# Nativz Cortex — Dashboard',
    '',
    '> The brain of the agency. All client strategy, research, and ideas in one place.',
    '',
    '## Clients',
    '',
  ];

  for (const c of clients) {
    dashSections.push(`- [[Clients/${c.name}/_profile|${c.name}]]`);
  }
  dashSections.push('');

  await writeFile('Dashboard.md', dashSections.join('\n'), 'update dashboard');

  // 5. Create .obsidian config for vault settings
  console.log('\nStep 4: Creating Obsidian config...');
  const obsidianConfig = JSON.stringify({
    basePath: '',
    livePreview: true,
    readableLineLength: true,
    showFrontmatter: false,
  }, null, 2);

  const appExists = await fileExists('.obsidian/app.json');
  if (!appExists) {
    await writeFile('.obsidian/app.json', obsidianConfig, 'init: obsidian config');
  } else {
    console.log('  Exists: .obsidian/app.json');
  }

  console.log('\n✅ Vault initialization complete!');
  console.log(`\nTo use in Obsidian:`);
  console.log(`  1. Clone the repo: git clone https://github.com/${GITHUB_REPO}.git`);
  console.log(`  2. Open the cloned folder as an Obsidian vault`);
  console.log(`  3. Install the "Obsidian Git" community plugin for auto-sync`);
}

main().catch(e => console.error('Error:', e));
