import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isVaultConfigured, writeFile, fileExists } from '@/lib/vault/github';
import { syncClientProfileToVault, syncDashboardToVault } from '@/lib/vault/sync';

/**
 * POST /api/vault/init
 * Initialize the vault with folder structure, templates, and current client data.
 */
export async function POST() {
  try {
    // Auth check — admin only
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isVaultConfigured()) {
      return NextResponse.json({ error: 'Vault not configured. Set GITHUB_VAULT_TOKEN and GITHUB_VAULT_REPO.' }, { status: 503 });
    }

    const created: string[] = [];

    // Create templates (only if they don't exist)
    const templates: Record<string, string> = {
      'Templates/research-report.md': TEMPLATE_RESEARCH,
      'Templates/idea.md': TEMPLATE_IDEA,
      'Templates/client-profile.md': TEMPLATE_CLIENT_PROFILE,
      'Templates/shoot-prep.md': TEMPLATE_SHOOT_PREP,
      'Templates/meeting-prep.md': TEMPLATE_MEETING_PREP,
    };

    for (const [path, content] of Object.entries(templates)) {
      const exists = await fileExists(path);
      if (!exists) {
        await writeFile(path, content, `init: ${path}`);
        created.push(path);
      }
    }

    // Fetch all clients and sync their profiles
    const adminClient = createAdminClient();
    const { data: clients } = await adminClient
      .from('clients')
      .select('name, slug, industry, website_url, target_audience, brand_voice, topic_keywords, logo_url, preferences')
      .eq('is_active', true)
      .order('name');

    if (clients?.length) {
      for (const client of clients) {
        await syncClientProfileToVault(client);
        created.push(`Clients/${client.name}/_profile.md`);
      }

      // Update dashboard MOC
      await syncDashboardToVault(clients.map((c) => ({ name: c.name, slug: c.slug })));
      created.push('Dashboard.md');
    }

    return NextResponse.json({ success: true, created });
  } catch (error) {
    console.error('POST /api/vault/init error:', error);
    return NextResponse.json({ error: 'Failed to initialize vault' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Template content
// ---------------------------------------------------------------------------

const TEMPLATE_RESEARCH = `---
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
`;

const TEMPLATE_IDEA = `---
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
`;

const TEMPLATE_CLIENT_PROFILE = `---
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
`;

const TEMPLATE_SHOOT_PREP = `---
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
<!-- Link to relevant research notes -->

## Notes
`;

const TEMPLATE_MEETING_PREP = `---
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
<!-- Link to recent research notes -->

## Action items
- [ ] Item 1
- [ ] Item 2
`;
