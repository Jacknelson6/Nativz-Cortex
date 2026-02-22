/**
 * Markdown formatters for converting Cortex data into Obsidian-compatible
 * markdown with YAML frontmatter.
 */

import type { TopicSearch, TrendingTopic, VideoIdea, ContentPillar } from '@/lib/types/search';
import type { ContentStrategy, ShootPlan } from '@/lib/types/strategy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function frontmatter(fields: Record<string, unknown>): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - "${String(item).replace(/"/g, '\\"')}"`);
      }
    } else if (typeof value === 'object') {
      continue; // Skip complex objects in frontmatter
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Client profile
// ---------------------------------------------------------------------------

interface ClientProfileData {
  name: string;
  industry: string;
  website_url?: string | null;
  target_audience?: string | null;
  brand_voice?: string | null;
  topic_keywords?: string[];
  logo_url?: string | null;
  preferences?: {
    tone_keywords?: string[];
    topics_lean_into?: string[];
    topics_avoid?: string[];
    competitor_accounts?: string[];
    seasonal_priorities?: string[];
  } | null;
}

export function formatClientProfile(client: ClientProfileData): string {
  const fm = frontmatter({
    type: 'client-profile',
    client: client.name,
    industry: client.industry,
    website: client.website_url,
    updated: new Date().toISOString().split('T')[0],
  });

  const sections: string[] = [
    fm,
    '',
    `# ${client.name}`,
    '',
    `> ${client.industry}`,
    '',
  ];

  if (client.website_url) {
    sections.push(`**Website:** ${client.website_url}`, '');
  }

  if (client.target_audience) {
    sections.push('## Target audience', '', client.target_audience, '');
  }

  if (client.brand_voice) {
    sections.push('## Brand voice', '', client.brand_voice, '');
  }

  if (client.topic_keywords?.length) {
    sections.push('## Topic keywords', '', client.topic_keywords.map((k) => `- ${k}`).join('\n'), '');
  }

  const p = client.preferences;
  if (p) {
    if (p.tone_keywords?.length) {
      sections.push('## Tone keywords', '', p.tone_keywords.map((k) => `- ${k}`).join('\n'), '');
    }
    if (p.topics_lean_into?.length) {
      sections.push('## Topics to lean into', '', p.topics_lean_into.map((k) => `- ${k}`).join('\n'), '');
    }
    if (p.topics_avoid?.length) {
      sections.push('## Topics to avoid', '', p.topics_avoid.map((k) => `- ${k}`).join('\n'), '');
    }
    if (p.competitor_accounts?.length) {
      sections.push('## Competitors', '', p.competitor_accounts.map((k) => `- ${k}`).join('\n'), '');
    }
    if (p.seasonal_priorities?.length) {
      sections.push('## Seasonal priorities', '', p.seasonal_priorities.map((k) => `- ${k}`).join('\n'), '');
    }
  }

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Research report (from search results)
// ---------------------------------------------------------------------------

export function formatResearchReport(
  search: TopicSearch,
  clientName?: string,
): string {
  const date = formatDate(search.created_at);
  const isBrand = search.source === 'client_strategy';

  const fm = frontmatter({
    type: 'research',
    client: clientName || null,
    query: search.query,
    date,
    search_mode: isBrand ? 'brand-intel' : 'topic-research',
    status: search.status,
    cortex_id: search.id,
    cortex_link: `/admin/search/${search.id}`,
  });

  const sections: string[] = [
    fm,
    '',
    `# ${search.query}`,
    '',
    `> ${isBrand ? 'Brand intel' : 'Topic research'} — ${date}${clientName ? ` — ${clientName}` : ''}`,
    '',
  ];

  // Executive summary
  if (search.summary) {
    sections.push('## Executive summary', '', search.summary, '');
  }

  // Brand alignment (client strategy only)
  const aiResponse = search.raw_ai_response as TopicSearch['raw_ai_response'] & {
    brand_alignment_notes?: string;
    content_pillars?: ContentPillar[];
  };

  if (aiResponse?.brand_alignment_notes) {
    sections.push('## Brand alignment', '', aiResponse.brand_alignment_notes, '');
  }

  // Emotions
  if (search.emotions?.length) {
    sections.push('## Emotional breakdown', '');
    for (const e of search.emotions) {
      sections.push(`- **${e.emotion}**: ${e.percentage}%`);
    }
    sections.push('');
  }

  // Content pillars (brand mode)
  if (aiResponse?.content_pillars?.length) {
    sections.push('## Content pillars', '');
    for (const p of aiResponse.content_pillars) {
      sections.push(`### ${p.pillar}`, '', p.description, '', `*Example series:* ${p.example_series}`, '');
    }
  }

  // Trending topics
  if (search.trending_topics?.length) {
    sections.push('## Trending topics', '');
    for (const topic of search.trending_topics) {
      sections.push(`### ${topic.name}`, '');
      sections.push(`**Resonance:** ${topic.resonance} | **Sentiment:** ${topic.sentiment}`, '');

      if ('posts_overview' in topic && topic.posts_overview) {
        sections.push('**What people are posting:**', '', topic.posts_overview, '');
      }
      if ('comments_overview' in topic && topic.comments_overview) {
        sections.push('**What people are saying:**', '', topic.comments_overview, '');
      }

      // Video ideas under each topic
      if (topic.video_ideas?.length) {
        sections.push('#### Video ideas', '');
        for (const idea of topic.video_ideas) {
          sections.push(formatVideoIdeaBlock(idea));
        }
      }

      // Sources
      if ('sources' in topic && (topic as TrendingTopic).sources?.length) {
        sections.push('#### Sources', '');
        for (const src of (topic as TrendingTopic).sources) {
          sections.push(`- [${src.title}](${src.url}) *(${src.type})*`);
        }
        sections.push('');
      }
    }
  }

  return sections.join('\n');
}

function formatVideoIdeaBlock(idea: VideoIdea): string {
  return [
    `- **${idea.title}**`,
    `  - Hook: ${idea.hook}`,
    `  - Format: ${idea.format}`,
    `  - Virality: ${idea.virality}`,
    `  - Why it works: ${idea.why_it_works}`,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Idea note
// ---------------------------------------------------------------------------

interface IdeaData {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  source_url?: string | null;
  status: string;
  created_at: string;
}

export function formatIdeaNote(idea: IdeaData, clientName?: string): string {
  const fm = frontmatter({
    type: 'idea',
    client: clientName || null,
    category: idea.category,
    status: idea.status,
    cortex_id: idea.id,
    created: formatDate(idea.created_at),
  });

  const sections: string[] = [
    fm,
    '',
    `# ${idea.title}`,
    '',
  ];

  if (idea.description) {
    sections.push(idea.description, '');
  }

  if (idea.source_url) {
    sections.push(`**Source:** ${idea.source_url}`, '');
  }

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Dashboard (Map of Content)
// ---------------------------------------------------------------------------

export function formatDashboard(clients: Array<{ name: string; slug: string }>): string {
  const fm = frontmatter({
    type: 'dashboard',
    updated: new Date().toISOString().split('T')[0],
  });

  const sections: string[] = [
    fm,
    '',
    '# Nativz Cortex — Dashboard',
    '',
    '> The brain of the agency. All client strategy, research, and ideas in one place.',
    '',
    '## Clients',
    '',
  ];

  for (const client of clients) {
    sections.push(`- [[Clients/${client.name}/_profile|${client.name}]]`);
  }
  sections.push('');

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Path builders
// ---------------------------------------------------------------------------

export function clientDir(clientName: string): string {
  return `Clients/${clientName}`;
}

export function clientProfilePath(clientName: string): string {
  return `${clientDir(clientName)}/_profile.md`;
}

export function researchPath(clientName: string, query: string, date: string): string {
  const dateStr = formatDate(date);
  return `${clientDir(clientName)}/Research/${dateStr}-${slugify(query)}.md`;
}

export function ideaPath(clientName: string, title: string): string {
  return `${clientDir(clientName)}/Ideas/${slugify(title)}.md`;
}

export function genericResearchPath(query: string, date: string): string {
  const dateStr = formatDate(date);
  return `Research/${dateStr}-${slugify(query)}.md`;
}

export function strategyPath(clientName: string): string {
  return `${clientDir(clientName)}/Strategy/onboard-strategy.md`;
}

export function shootPlanPath(clientName: string, shootDate: string): string {
  const dateStr = formatDate(shootDate);
  return `${clientDir(clientName)}/Shoots/${dateStr}-shoot-plan.md`;
}

export function contentLogPath(clientName: string, title: string): string {
  return `${clientDir(clientName)}/Content Log/${slugify(title)}.md`;
}

// ---------------------------------------------------------------------------
// Content strategy (onboard)
// ---------------------------------------------------------------------------

export function formatStrategy(
  strategy: ContentStrategy,
  clientName: string,
  industry: string,
): string {
  const fm = frontmatter({
    type: 'content-strategy',
    client: clientName,
    industry,
    created: new Date().toISOString().split('T')[0],
  });

  const sections: string[] = [
    fm,
    '',
    `# Content strategy — ${clientName}`,
    '',
    `> Generated by Nativz Cortex on ${new Date().toISOString().split('T')[0]}`,
    '',
    '## Executive summary',
    '',
    strategy.executive_summary,
    '',
  ];

  // Audience analysis
  if (strategy.audience_analysis) {
    const a = strategy.audience_analysis;
    sections.push(
      '## Audience analysis',
      '',
      `**Demographics:** ${a.demographics}`,
      '',
      `**Psychographics:** ${a.psychographics}`,
      '',
      `**Online behavior:** ${a.online_behavior}`,
      '',
    );
    if (a.pain_points?.length) {
      sections.push('### Pain points', '', ...a.pain_points.map((p) => `- ${p}`), '');
    }
    if (a.aspirations?.length) {
      sections.push('### Aspirations', '', ...a.aspirations.map((a) => `- ${a}`), '');
    }
  }

  // Content pillars
  if (strategy.content_pillars?.length) {
    sections.push('## Content pillars', '');
    for (const p of strategy.content_pillars) {
      sections.push(
        `### ${p.pillar}`,
        '',
        p.description,
        '',
        `**Frequency:** ${p.frequency}`,
        `**Formats:** ${p.formats.join(', ')}`,
        '',
      );
      if (p.example_series?.length) {
        sections.push('**Series ideas:**', ...p.example_series.map((s) => `- ${s}`), '');
      }
      if (p.hooks?.length) {
        sections.push('**Hook templates:**', ...p.hooks.map((h) => `- "${h}"`), '');
      }
    }
  }

  // Platform strategy
  if (strategy.platform_strategy?.length) {
    sections.push('## Platform strategy', '');
    for (const p of strategy.platform_strategy) {
      sections.push(
        `### ${p.platform} (${p.priority})`,
        '',
        p.rationale,
        '',
        `**Cadence:** ${p.posting_cadence}`,
        `**Content types:** ${p.content_types.join(', ')}`,
        '',
      );
    }
  }

  // Trending opportunities
  if (strategy.trending_opportunities?.length) {
    sections.push('## Trending opportunities', '');
    for (const t of strategy.trending_opportunities) {
      sections.push(
        `### ${t.trend} (${t.urgency})`,
        '',
        `**Relevance:** ${t.relevance}`,
        `**Angle:** ${t.content_angle}`,
        '',
      );
    }
  }

  // Video ideas
  if (strategy.video_ideas?.length) {
    sections.push('## Video ideas', '');
    for (const v of strategy.video_ideas) {
      sections.push(
        `### ${v.title}`,
        '',
        `- **Hook:** ${v.hook}`,
        `- **Format:** ${v.format}`,
        `- **Platform:** ${v.platform}`,
        `- **Virality:** ${v.estimated_virality}`,
        `- **Pillar:** ${v.pillar}`,
        `- **Why it works:** ${v.why_it_works}`,
        '',
      );
    }
  }

  // Competitive landscape
  if (strategy.competitive_landscape?.length) {
    sections.push('## Competitive landscape', '');
    for (const c of strategy.competitive_landscape) {
      sections.push(
        `### ${c.competitor}`,
        '',
        `- **Strengths:** ${c.strengths}`,
        `- **Weaknesses:** ${c.weaknesses}`,
        `- **Opportunity:** ${c.gap_opportunity}`,
        '',
      );
    }
  }

  // Next steps
  if (strategy.next_steps?.length) {
    sections.push('## Next steps (first 30 days)', '');
    for (const s of strategy.next_steps) {
      sections.push(`- **[${s.priority.toUpperCase()}]** ${s.action} — ${s.timeline} *(${s.category})*`);
    }
    sections.push('');
  }

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Shoot plan
// ---------------------------------------------------------------------------

export function formatShootPlan(
  plan: ShootPlan,
  clientName: string,
  shootDate: string,
  title: string,
): string {
  const dateStr = formatDate(shootDate);

  const fm = frontmatter({
    type: 'shoot-plan',
    client: clientName,
    shoot_date: dateStr,
    title,
    generated: new Date().toISOString().split('T')[0],
  });

  const sections: string[] = [
    fm,
    '',
    `# Shoot plan — ${clientName}`,
    '',
    `> ${title} — ${dateStr}`,
    '',
    '## Overview',
    '',
    plan.overview,
    '',
    '## Client context',
    '',
    plan.client_context,
    '',
  ];

  if (plan.past_performance_insights) {
    sections.push('## Past performance insights', '', plan.past_performance_insights, '');
  }

  if (plan.trending_angles?.length) {
    sections.push('## Trending angles', '');
    for (const a of plan.trending_angles) {
      sections.push(
        `### ${a.topic}`,
        '',
        `**Angle:** ${a.angle}`,
        `**Why now:** ${a.why_now}`,
        `**Format:** ${a.format}`,
        `**Estimated virality:** ${a.estimated_virality}`,
        '',
      );
    }
  }

  if (plan.shot_list?.length) {
    sections.push('## Shot list', '');
    for (const s of plan.shot_list) {
      const badge = s.priority === 'must_have' ? '🔴' : s.priority === 'nice_to_have' ? '🟡' : '🟢';
      sections.push(
        `### ${badge} ${s.title}`,
        '',
        s.description,
        '',
        `- **Format:** ${s.format}`,
        `- **Platform:** ${s.platform}`,
        `- **Hook:** ${s.hook}`,
        `- **B-roll:** ${s.b_roll_notes}`,
        '',
      );
    }
  }

  if (plan.content_calendar?.length) {
    sections.push('## Content calendar', '');
    sections.push('| Day | Title | Platform | Format | Notes |');
    sections.push('|-----|-------|----------|--------|-------|');
    for (const c of plan.content_calendar) {
      sections.push(`| ${c.day} | ${c.content_title} | ${c.platform} | ${c.format} | ${c.notes} |`);
    }
    sections.push('');
  }

  if (plan.logistics_notes?.length) {
    sections.push('## Logistics', '', ...plan.logistics_notes.map((n) => `- ${n}`), '');
  }

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Content log
// ---------------------------------------------------------------------------

export function formatContentLog(
  log: { title: string; content_type?: string | null; platform?: string | null; performance_notes?: string | null; published_at?: string | null },
  clientName: string,
): string {
  const fm = frontmatter({
    type: 'content-log',
    client: clientName,
    content_type: log.content_type,
    platform: log.platform,
    published: log.published_at ? formatDate(log.published_at) : null,
  });

  const sections: string[] = [fm, '', `# ${log.title}`, ''];

  if (log.platform) sections.push(`**Platform:** ${log.platform}`, '');
  if (log.content_type) sections.push(`**Type:** ${log.content_type}`, '');
  if (log.performance_notes) sections.push('## Performance notes', '', log.performance_notes, '');

  return sections.join('\n');
}
