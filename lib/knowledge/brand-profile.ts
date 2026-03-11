import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import {
  getKnowledgeEntries,
  createKnowledgeEntry,
  createKnowledgeLink,
  getBrandProfile,
  updateKnowledgeEntry,
} from '@/lib/knowledge/queries';
import type { KnowledgeEntry, BrandProfileMetadata } from '@/lib/knowledge/types';

// ---------------------------------------------------------------------------
// Generate a comprehensive brand profile from all available client data
// ---------------------------------------------------------------------------

export async function generateBrandProfile(
  clientId: string,
  createdBy: string | null
): Promise<KnowledgeEntry> {
  const admin = createAdminClient();

  // 1. Fetch core client data
  const { data: client, error: clientError } = await admin
    .from('clients')
    .select(
      'id, name, industry, target_audience, brand_voice, topic_keywords, website_url, logo_url, preferences, services, description'
    )
    .eq('id', clientId)
    .single();

  if (clientError || !client) {
    throw new Error(`Failed to fetch client: ${clientError?.message ?? 'Not found'}`);
  }

  // 2. Parallel fetch: contacts, social profiles, latest strategy
  const [contactsResult, socialsResult, strategyResult, webPages] = await Promise.all([
    admin
      .from('contacts')
      .select('full_name, role')
      .eq('client_id', clientId)
      .limit(20),
    admin
      .from('social_profiles')
      .select('platform, username')
      .eq('client_id', clientId),
    admin
      .from('client_strategies')
      .select('id, executive_summary, content_pillars')
      .eq('client_id', clientId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // 3. Fetch scraped web pages
    getKnowledgeEntries(clientId, 'web_page'),
  ]);

  const contacts = contactsResult.data ?? [];
  const socials = socialsResult.data ?? [];
  const strategy = strategyResult.data ?? null;

  // Track sources used for metadata
  const generatedFrom: string[] = ['client_record'];
  if (contacts.length > 0) generatedFrom.push('contacts');
  if (socials.length > 0) generatedFrom.push('social_profiles');
  if (strategy) generatedFrom.push(`strategy:${strategy.id}`);
  if (webPages.length > 0) generatedFrom.push('web_pages');

  // Truncate web page content to keep prompt reasonable
  const webPageSummaries = webPages.slice(0, 10).map((wp) => {
    const content = (wp.content ?? '').slice(0, 2000);
    const url = (wp.metadata as Record<string, unknown>)?.source_url ?? '';
    return `<page url="${url}">\n${content}\n</page>`;
  });

  // 4-5. Build the prompt with XML-tagged context blocks
  const prompt = `You are a brand strategist. Analyze all the data provided below and generate a comprehensive brand profile document.

<client>
  <name>${client.name ?? ''}</name>
  <industry>${client.industry ?? ''}</industry>
  <description>${client.description ?? ''}</description>
  <target_audience>${client.target_audience ?? ''}</target_audience>
  <brand_voice>${client.brand_voice ?? ''}</brand_voice>
  <topic_keywords>${JSON.stringify(client.topic_keywords ?? [])}</topic_keywords>
  <website_url>${client.website_url ?? ''}</website_url>
  <services>${JSON.stringify(client.services ?? [])}</services>
  <preferences>${JSON.stringify(client.preferences ?? {})}</preferences>
</client>

<contacts>
${contacts.map((c) => `  <contact name="${c.full_name ?? ''}" role="${c.role ?? ''}" />`).join('\n')}
</contacts>

<social_profiles>
${socials.map((s) => `  <profile platform="${s.platform ?? ''}" username="${s.username ?? ''}" />`).join('\n')}
</social_profiles>

${strategy ? `<strategy>
  <executive_summary>${(strategy.executive_summary as string) ?? ''}</executive_summary>
  <content_pillars>${JSON.stringify((strategy.content_pillars as unknown) ?? [])}</content_pillars>
</strategy>` : ''}

<web_pages>
${webPageSummaries.join('\n')}
</web_pages>

Generate a structured brand profile with these sections. Write in clear, actionable detail. Use markdown formatting.

## Brand Identity
Mission, values, and market positioning.

## Voice & Tone
Communication style, vocabulary preferences, do's and don'ts for content creation.

## Visual Identity
Colors, typography notes, imagery style and aesthetic direction.

## Target Audience
Demographics, psychographics, pain points, and aspirations.

## Content Themes
Core topics, content pillars, and seasonal or timely angles to pursue.

## Competitive Positioning
How this brand differentiates itself and its unique value proposition.

Important: Base all analysis on the data provided. If data is sparse for a section, note what's available and provide reasonable inferences clearly marked as such.`;

  // 6. Call OpenRouter
  const aiResult = await createCompletion({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 4000,
  });

  const profileContent = aiResult.text ?? '';

  // 7. If existing brand profile exists, mark it as superseded
  const existing = await getBrandProfile(clientId);
  if (existing) {
    await updateKnowledgeEntry(existing.id, {
      metadata: {
        ...existing.metadata,
        superseded_by: 'new',
      },
    });
  }

  // 8. Create the new brand profile entry
  const metadata: Record<string, unknown> = {
    generated_from: generatedFrom,
  } satisfies BrandProfileMetadata;

  const newEntry = await createKnowledgeEntry({
    client_id: clientId,
    type: 'brand_profile',
    title: `Brand profile — ${client.name ?? 'Unknown'}`,
    content: profileContent,
    metadata,
    source: 'generated',
    created_by: createdBy,
  });

  // 9. Auto-link to scraped pages, strategy, and contacts
  const linkPromises: Promise<unknown>[] = [];

  // Link to web pages (first 10)
  for (const wp of webPages.slice(0, 10)) {
    linkPromises.push(
      createKnowledgeLink({
        client_id: clientId,
        source_id: newEntry.id,
        source_type: 'entry',
        target_id: wp.id,
        target_type: 'entry',
        label: 'generated_from',
      })
    );
  }

  // Link to strategy
  if (strategy) {
    linkPromises.push(
      createKnowledgeLink({
        client_id: clientId,
        source_id: newEntry.id,
        source_type: 'entry',
        target_id: strategy.id,
        target_type: 'strategy',
        label: 'generated_from',
      })
    );
  }

  // Link to contacts (first 5)
  if (contacts.length > 0) {
    // Fetch contact IDs for linking
    const { data: contactRows } = await admin
      .from('contacts')
      .select('id')
      .eq('client_id', clientId)
      .limit(5);

    for (const contact of contactRows ?? []) {
      linkPromises.push(
        createKnowledgeLink({
          client_id: clientId,
          source_id: newEntry.id,
          source_type: 'entry',
          target_id: contact.id,
          target_type: 'contact',
          label: 'references',
        })
      );
    }
  }

  await Promise.all(linkPromises);

  return newEntry;
}
