/**
 * Vault content memory — reads past research, content logs, and strategies
 * from the vault to provide context for shoot plan generation.
 */

import { createAdminClient } from '@/lib/supabase/admin';

interface PastResearch {
  query: string;
  summary: string;
  created_at: string;
  trending_topics: string[];
}

interface PastContentLog {
  title: string;
  content_type: string | null;
  platform: string | null;
  performance_notes: string | null;
  published_at: string | null;
}

export interface ClientMemory {
  pastResearch: PastResearch[];
  contentLogs: PastContentLog[];
  strategyExcerpt: string | null;
}

/**
 * Gather a client's content history from the database.
 * Returns past research summaries, content logs, and the most recent strategy excerpt.
 */
export async function getClientMemory(clientId: string): Promise<ClientMemory> {
  const adminClient = createAdminClient();

  // Fetch past research (last 5 completed searches)
  const { data: searches } = await adminClient
    .from('topic_searches')
    .select('query, summary, created_at, trending_topics')
    .eq('client_id', clientId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(5);

  const pastResearch: PastResearch[] = (searches ?? []).map((s) => ({
    query: s.query,
    summary: s.summary ?? '',
    created_at: s.created_at,
    trending_topics: (s.trending_topics as Array<{ name?: string }> ?? [])
      .map((t) => t.name ?? '')
      .filter(Boolean)
      .slice(0, 5),
  }));

  // Fetch content logs (last 10)
  const { data: logs } = await adminClient
    .from('content_logs')
    .select('title, content_type, platform, performance_notes, published_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(10);

  const contentLogs: PastContentLog[] = (logs ?? []).map((l) => ({
    title: l.title,
    content_type: l.content_type,
    platform: l.platform,
    performance_notes: l.performance_notes,
    published_at: l.published_at,
  }));

  // Fetch most recent strategy excerpt
  const { data: strategy } = await adminClient
    .from('client_strategies')
    .select('executive_summary, content_pillars')
    .eq('client_id', clientId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  let strategyExcerpt: string | null = null;
  if (strategy) {
    const pillars = (strategy.content_pillars as Array<{ pillar?: string }> ?? [])
      .map((p) => p.pillar)
      .filter(Boolean);
    strategyExcerpt = [
      strategy.executive_summary,
      pillars.length > 0 ? `Content pillars: ${pillars.join(', ')}` : '',
    ].filter(Boolean).join('\n\n');
  }

  return { pastResearch, contentLogs, strategyExcerpt };
}

/**
 * Format client memory into a text block for injection into AI prompts.
 */
export function formatClientMemoryBlock(memory: ClientMemory): string {
  const sections: string[] = [];

  if (memory.strategyExcerpt) {
    sections.push(`<existing_strategy>\n${memory.strategyExcerpt}\n</existing_strategy>`);
  }

  if (memory.pastResearch.length > 0) {
    const researchLines = memory.pastResearch.map((r) =>
      `- "${r.query}" (${r.created_at.split('T')[0]}): ${r.summary.substring(0, 200)}... Topics: ${r.trending_topics.join(', ')}`
    );
    sections.push(`<past_research>\n${researchLines.join('\n')}\n</past_research>`);
  }

  if (memory.contentLogs.length > 0) {
    const logLines = memory.contentLogs.map((l) =>
      `- ${l.title} (${l.content_type ?? 'unknown'} on ${l.platform ?? 'unknown'})${l.performance_notes ? ` — ${l.performance_notes}` : ''}`
    );
    sections.push(`<content_produced>\n${logLines.join('\n')}\n</content_produced>`);
  }

  if (sections.length === 0) {
    return '<client_history>\nNo previous content history available. This is a new client.\n</client_history>';
  }

  return `<client_history>\n${sections.join('\n\n')}\n</client_history>`;
}
