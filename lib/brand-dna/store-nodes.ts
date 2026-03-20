/**
 * Store Brand DNA as multiple knowledge entries linked in a hub-and-spoke graph.
 *
 * Creates: 1 brand_guideline hub + 5 category nodes + N logo nodes + N screenshot nodes
 * Links: all nodes connected to hub via client_knowledge_links
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { createKnowledgeEntry, createKnowledgeLink } from '@/lib/knowledge/queries';
import { generateEmbeddingsBatch, generateMultimodalEmbedding } from '@/lib/ai/embeddings';
import { BRAND_DNA_TYPES } from '@/lib/knowledge/types';
import type { CompiledBrandDNA } from './types';
import type { BrandGuidelineMetadata } from '@/lib/knowledge/types';
import { buildCanonicalProductCatalogMarkdown } from './product-catalog-md';

interface StoredBrandDNA {
  guidelineId: string;
  totalEntries: number;
  totalLinks: number;
}

/**
 * Delete all existing Brand DNA entries for a client before regeneration.
 * Hard-delete is safe because Brand DNA is always regenerated as a complete set.
 */
async function deleteExistingBrandDNA(clientId: string): Promise<void> {
  const admin = createAdminClient();

  // Get IDs of existing Brand DNA entries
  const { data: existing } = await admin
    .from('client_knowledge_entries')
    .select('id')
    .eq('client_id', clientId)
    .in('type', BRAND_DNA_TYPES);

  if (!existing || existing.length === 0) return;

  const entryIds = existing.map((e) => e.id);

  // Delete links first (FK constraint)
  await admin
    .from('client_knowledge_links')
    .delete()
    .eq('client_id', clientId)
    .or(`source_id.in.(${entryIds.join(',')}),target_id.in.(${entryIds.join(',')})`);

  // Delete entries
  await admin
    .from('client_knowledge_entries')
    .delete()
    .eq('client_id', clientId)
    .in('type', BRAND_DNA_TYPES);
}

/**
 * Create a single link between two entries.
 */
async function linkEntries(
  clientId: string,
  sourceId: string,
  targetId: string,
  label: string,
): Promise<void> {
  try {
    await createKnowledgeLink({
      client_id: clientId,
      source_id: sourceId,
      source_type: 'entry',
      target_id: targetId,
      target_type: 'entry',
      label,
    });
  } catch (err) {
    // Duplicate link constraint — ignore
    console.warn(`Link creation skipped (${label}):`, err);
  }
}

/**
 * Store Brand DNA as a multi-node graph in client_knowledge_entries.
 */
export async function storeBrandDNANodes(
  clientId: string,
  clientName: string,
  compiled: CompiledBrandDNA,
): Promise<StoredBrandDNA> {
  const meta = compiled.metadata;

  // ── 1. Hard-delete previous Brand DNA ─────────────────────────────────────
  await deleteExistingBrandDNA(clientId);

  // ── 2. Create hub node (brand_guideline) ──────────────────────────────────
  const hub = await createKnowledgeEntry({
    client_id: clientId,
    type: 'brand_guideline',
    title: `${clientName} — Brand DNA`,
    content: compiled.content,
    metadata: meta as unknown as Record<string, unknown>,
    source: 'generated',
    created_by: null,
  });

  const entryIds: string[] = [hub.id];
  const imageEntries: { id: string; url: string; text: string }[] = [];

  // ── 3. Create category nodes ──────────────────────────────────────────────

  // Visual Identity
  const visualContent = buildVisualIdentityMarkdown(meta);
  const visual = await createKnowledgeEntry({
    client_id: clientId,
    type: 'visual_identity',
    title: `Visual Identity — ${clientName}`,
    content: visualContent,
    metadata: {
      colors: meta.colors ?? [],
      fonts: meta.fonts ?? [],
      design_style: meta.design_style ?? null,
    },
    source: 'generated',
    created_by: null,
  });
  entryIds.push(visual.id);

  // Verbal Identity
  const verbalContent = buildVerbalIdentityMarkdown(meta);
  const verbal = await createKnowledgeEntry({
    client_id: clientId,
    type: 'verbal_identity',
    title: `Verbal Identity — ${clientName}`,
    content: verbalContent,
    metadata: {
      tone_primary: meta.tone_primary ?? null,
      voice_attributes: meta.voice_attributes ?? [],
      messaging_pillars: meta.messaging_pillars ?? [],
      vocabulary_patterns: meta.vocabulary_patterns ?? [],
      avoidance_patterns: meta.avoidance_patterns ?? [],
    },
    source: 'generated',
    created_by: null,
  });
  entryIds.push(verbal.id);

  // Target Audience
  const audienceContent = meta.target_audience_summary ?? 'No target audience data extracted.';
  const audience = await createKnowledgeEntry({
    client_id: clientId,
    type: 'target_audience',
    title: `Target Audience — ${clientName}`,
    content: audienceContent,
    metadata: { summary: meta.target_audience_summary ?? '' },
    source: 'generated',
    created_by: null,
  });
  entryIds.push(audience.id);

  // Competitive Positioning
  const positioningContent = meta.competitive_positioning ?? 'No competitive positioning data extracted.';
  const positioning = await createKnowledgeEntry({
    client_id: clientId,
    type: 'competitive_positioning',
    title: `Competitive Positioning — ${clientName}`,
    content: positioningContent,
    metadata: { positioning_statement: meta.competitive_positioning ?? '' },
    source: 'generated',
    created_by: null,
  });
  entryIds.push(positioning.id);

  // Product Catalog
  const productsContent = buildCanonicalProductCatalogMarkdown(meta.products ?? [], 'standalone');
  const products = await createKnowledgeEntry({
    client_id: clientId,
    type: 'product_catalog',
    title: `Products & Services — ${clientName}`,
    content: productsContent,
    metadata: { products: meta.products ?? [] },
    source: 'generated',
    created_by: null,
  });
  entryIds.push(products.id);

  // ── 4. Create individual nodes (logos + screenshots) ──────────────────────

  const logoIds: string[] = [];
  for (const logo of meta.logos ?? []) {
    const logoEntry = await createKnowledgeEntry({
      client_id: clientId,
      type: 'brand_logo',
      title: `Logo (${logo.variant}) — ${clientName}`,
      content: `${logo.variant} logo variant for ${clientName}. URL: ${logo.url}`,
      metadata: { url: logo.url, variant: logo.variant },
      source: 'generated',
      created_by: null,
    });
    entryIds.push(logoEntry.id);
    logoIds.push(logoEntry.id);
    imageEntries.push({ id: logoEntry.id, url: logo.url, text: `${logo.variant} logo for ${clientName}` });
  }

  const screenshotIds: string[] = [];
  for (const ss of meta.screenshots ?? []) {
    const ssEntry = await createKnowledgeEntry({
      client_id: clientId,
      type: 'brand_screenshot',
      title: `Screenshot: ${ss.page} — ${clientName}`,
      content: `Website screenshot of ${ss.page}. ${ss.description}`,
      metadata: { url: ss.url, page: ss.page, source_url: ss.url },
      source: 'generated',
      created_by: null,
    });
    entryIds.push(ssEntry.id);
    screenshotIds.push(ssEntry.id);
    imageEntries.push({ id: ssEntry.id, url: ss.url, text: `${ss.page} page screenshot: ${ss.description}` });
  }

  // ── 5. Create links ──────────────────────────────────────────────────────

  let linkCount = 0;

  // Hub → category nodes
  for (const catId of [visual.id, verbal.id, audience.id, positioning.id, products.id]) {
    await linkEntries(clientId, hub.id, catId, 'component');
    linkCount++;
  }

  // Hub → individual nodes
  for (const logoId of logoIds) {
    await linkEntries(clientId, hub.id, logoId, 'asset');
    linkCount++;
  }
  for (const ssId of screenshotIds) {
    await linkEntries(clientId, hub.id, ssId, 'asset');
    linkCount++;
  }

  // Visual identity → logos + screenshots
  for (const logoId of logoIds) {
    await linkEntries(clientId, visual.id, logoId, 'illustrates');
    linkCount++;
  }
  for (const ssId of screenshotIds) {
    await linkEntries(clientId, visual.id, ssId, 'illustrates');
    linkCount++;
  }

  // ── 6. Embed all entries ──────────────────────────────────────────────────

  // Text entries — batch embed
  const textEntryIds = entryIds.filter(
    (id) => !imageEntries.some((ie) => ie.id === id),
  );
  const admin = createAdminClient();

  if (textEntryIds.length > 0) {
    const { data: textData } = await admin
      .from('client_knowledge_entries')
      .select('id, title, content')
      .in('id', textEntryIds);

    if (textData && textData.length > 0) {
      const texts = textData.map((e) => `${e.title}\n\n${(e.content ?? '').slice(0, 2000)}`);
      const embeddings = await generateEmbeddingsBatch(texts);

      for (let i = 0; i < textData.length; i++) {
        if (embeddings[i]) {
          await admin
            .from('client_knowledge_entries')
            .update({ embedding: JSON.stringify(embeddings[i]) })
            .eq('id', textData[i].id);
        }
      }
    }
  }

  // Image entries — sequential multimodal embed with rate limiting
  for (const img of imageEntries) {
    const embedding = await generateMultimodalEmbedding(img.text, img.url);
    if (embedding) {
      await admin
        .from('client_knowledge_entries')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', img.id);
    }
    // Rate limit: 200ms between multimodal calls
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return {
    guidelineId: hub.id,
    totalEntries: entryIds.length,
    totalLinks: linkCount,
  };
}

// ── Markdown builders ─────────────────────────────────────────────────────────

function buildVisualIdentityMarkdown(meta: BrandGuidelineMetadata): string {
  const sections: string[] = ['# Visual Identity\n'];

  if (meta.colors?.length) {
    sections.push('## Color Palette');
    for (const c of meta.colors) {
      sections.push(`- **${c.name}** \`${c.hex}\` — ${c.role}`);
    }
  }

  if (meta.fonts?.length) {
    sections.push('\n## Typography');
    for (const f of meta.fonts) {
      sections.push(`- **${f.family}** — ${f.role}${f.weight ? ` (${f.weight})` : ''}`);
    }
  }

  if (meta.design_style) {
    const ds = meta.design_style;
    sections.push('\n## Design Style');
    sections.push(`- **Theme:** ${ds.theme}`);
    sections.push(`- **Corners:** ${ds.corners}`);
    sections.push(`- **Density:** ${ds.density}`);
    sections.push(`- **Imagery:** ${ds.imagery}`);
  }

  return sections.join('\n');
}

function buildVerbalIdentityMarkdown(meta: BrandGuidelineMetadata): string {
  const sections: string[] = ['# Verbal Identity\n'];

  if (meta.tone_primary) sections.push(`**Primary Tone:** ${meta.tone_primary}\n`);

  if (meta.voice_attributes?.length) {
    sections.push('## Voice Attributes');
    sections.push(meta.voice_attributes.map((v) => `- ${v}`).join('\n'));
  }

  if (meta.messaging_pillars?.length) {
    sections.push('\n## Messaging Pillars');
    sections.push(meta.messaging_pillars.map((p) => `- ${p}`).join('\n'));
  }

  if (meta.vocabulary_patterns?.length) {
    sections.push('\n## Vocabulary Patterns');
    sections.push(meta.vocabulary_patterns.map((v) => `- ${v}`).join('\n'));
  }

  if (meta.avoidance_patterns?.length) {
    sections.push('\n## Avoidance Patterns');
    sections.push(meta.avoidance_patterns.map((a) => `- ~~${a}~~`).join('\n'));
  }

  return sections.join('\n');
}

