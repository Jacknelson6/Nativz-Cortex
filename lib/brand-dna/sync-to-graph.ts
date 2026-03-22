/**
 * Sync Brand DNA output to the knowledge_nodes table and GitHub AC Knowledge Graph.
 * Creates/updates a `client` node in knowledge_nodes with rich Brand DNA content,
 * so it appears in both the agency-wide and client-specific knowledge graphs.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { KNOWLEDGE_GRAPH_GITHUB_REPO } from '@/lib/knowledge/github-repo';
import { writeNodeToGitHub } from '@/lib/knowledge/github-sync';
import { slugifyNodeId } from '@/lib/knowledge/graph-queries';
import type { KnowledgeNode } from '@/lib/knowledge/graph-queries';
import type { BrandGuidelineMetadata } from '@/lib/knowledge/types';

interface CompiledDocument {
  content: string;
  metadata: BrandGuidelineMetadata;
}

/**
 * After Brand DNA generates, sync the results into the knowledge graph:
 * 1. Upsert a `client` node in `knowledge_nodes` with the brand overview + key data
 * 2. Write the node to GitHub AC Knowledge Graph repo
 */
export async function syncBrandDNAToKnowledgeGraph(
  clientId: string,
  clientName: string,
  compiled: CompiledDocument,
  websiteUrl: string,
): Promise<void> {
  const admin = createAdminClient();
  const meta = compiled.metadata;

  // Build rich content for the knowledge node from Brand DNA
  const sections: string[] = [];

  sections.push(`# ${clientName}\n`);
  sections.push(`**Website:** ${websiteUrl}\n`);

  // Extract brand overview from the compiled content (first section before ##)
  const overviewMatch = compiled.content.match(/^([\s\S]*?)(?=\n##\s)/);
  if (overviewMatch?.[1]?.trim()) {
    sections.push(overviewMatch[1].trim());
  }

  // Verbal identity
  if (meta.tone_primary || meta.messaging_pillars?.length) {
    sections.push('\n## Verbal Identity');
    if (meta.tone_primary) sections.push(`**Tone:** ${meta.tone_primary}`);
    if (meta.voice_attributes?.length) sections.push(`**Voice:** ${meta.voice_attributes.join(', ')}`);
    if (meta.messaging_pillars?.length) sections.push(`**Messaging pillars:** ${meta.messaging_pillars.join(', ')}`);
    if (meta.avoidance_patterns?.length) sections.push(`**Avoid:** ${meta.avoidance_patterns.join(', ')}`);
  }

  // Visual identity
  if (meta.colors?.length || meta.fonts?.length) {
    sections.push('\n## Visual Identity');
    if (meta.colors?.length) {
      const colorList = meta.colors.map((c) => `${c.name} (${c.hex}, ${c.role})`).join(', ');
      sections.push(`**Colors:** ${colorList}`);
    }
    if (meta.fonts?.length) {
      const fontList = meta.fonts.map((f) => `${f.family} (${f.role})`).join(', ');
      sections.push(`**Fonts:** ${fontList}`);
    }
    if (meta.design_style) {
      const ds = meta.design_style;
      sections.push(`**Design style:** ${ds.theme} theme, ${ds.corners} corners, ${ds.density} density, ${ds.imagery} imagery`);
    }
  }

  // Products
  if (meta.products?.length) {
    sections.push('\n## Products & Services');
    for (const p of meta.products.slice(0, 20)) {
      const t = p.offeringType ? ` _(${p.offeringType})_` : '';
      sections.push(`- **${p.name}**${t}: ${p.description}${p.price ? ` — ${p.price}` : ''}`);
    }
  }

  // Target audience
  if (meta.target_audience_summary) {
    sections.push(`\n## Target Audience\n${meta.target_audience_summary}`);
  }

  if (meta.ideal_customer_profiles?.length) {
    sections.push('\n## ICPs');
    for (const icp of meta.ideal_customer_profiles.slice(0, 5)) {
      sections.push(`- **${icp.label}:** ${icp.summary}`);
    }
  }

  // Competitive positioning
  if (meta.competitive_positioning) {
    sections.push(`\n## Competitive Positioning\n${meta.competitive_positioning}`);
  }

  if (meta.similar_brands_for_ads?.length) {
    sections.push('\n## Meta Ad Library references');
    for (const b of meta.similar_brands_for_ads) {
      sections.push(`- **${b.name}** (${b.category}): ${b.why_similar} — ${b.meta_ad_library_url}`);
    }
  }

  const nodeContent = sections.join('\n');

  // Build the node ID (consistent so upserts work)
  const nodeId = slugifyNodeId('client', clientName);

  // Tags for semantic retrieval
  const tags: string[] = [];
  if (meta.tone_primary) tags.push(meta.tone_primary.toLowerCase());
  if (meta.messaging_pillars?.length) tags.push(...meta.messaging_pillars.map((p) => p.toLowerCase()));
  tags.push('brand-dna');

  // Domain classification based on industry (from client record)
  const { data: clientRecord } = await admin
    .from('clients')
    .select('industry')
    .eq('id', clientId)
    .single();

  const domains: string[] = [];
  if (clientRecord?.industry) domains.push('client-ops');

  // Connections to domain nodes
  const connections: string[] = ['domain:client-ops'];

  // Upsert into knowledge_nodes
  const { error } = await admin
    .from('knowledge_nodes')
    .upsert(
      {
        id: nodeId,
        kind: 'client',
        title: clientName,
        content: nodeContent,
        domain: domains,
        tags,
        connections,
        client_id: clientId,
        sync_status: 'synced',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

  if (error) {
    console.error('Failed to upsert knowledge_node for Brand DNA:', error);
    throw error;
  }

  // Sync to GitHub (best-effort)
  try {
    const node: KnowledgeNode = {
      id: nodeId,
      kind: 'client',
      title: clientName,
      content: nodeContent,
      domain: domains,
      tags,
      connections,
      client_id: clientId,
      metadata: {},
      source_repo: KNOWLEDGE_GRAPH_GITHUB_REPO,
      source_path: `nodes/${nodeId.replace(':', '/')}.md`,
      source_sha: null,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: null,
    };

    await writeNodeToGitHub(node);
  } catch (ghErr) {
    console.error('GitHub sync failed (non-fatal):', ghErr);
    // Mark as pending sync
    await admin
      .from('knowledge_nodes')
      .update({ sync_status: 'pending' })
      .eq('id', nodeId);
  }
}
