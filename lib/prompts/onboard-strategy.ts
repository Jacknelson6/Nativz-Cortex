import type { BraveSerpData } from '@/lib/brave/types';
import type { ClientPreferences } from '@/lib/types/database';
import { formatBrandPreferencesBlock, hasPreferences } from './brand-context';

interface OnboardStrategyConfig {
  clientName: string;
  industry: string;
  targetAudience: string;
  brandVoice: string;
  topicKeywords: string[];
  websiteUrl: string;
  serpData: BraveSerpData;
  brandPreferences?: ClientPreferences | null;
}

function formatSerpBlock(serpData: BraveSerpData): string {
  let block = '';

  if (serpData.webResults.length > 0) {
    block += `### Web results (${serpData.webResults.length})\n`;
    for (const r of serpData.webResults) {
      block += `- **${r.title}**\n  ${r.url}\n  ${r.description}\n`;
      if (r.snippets && r.snippets.length > 0) {
        block += `  Snippets: ${r.snippets.join(' | ')}\n`;
      }
    }
    block += '\n';
  }

  if (serpData.discussions.length > 0) {
    block += `### Discussions (${serpData.discussions.length})\n`;
    for (const d of serpData.discussions) {
      block += `- **${d.title}** (${d.forum}${d.answers ? `, ${d.answers} answers` : ''})\n  ${d.url}\n  ${d.description}\n`;
      if (d.topComment) block += `  Top comment: "${d.topComment}"\n`;
    }
    block += '\n';
  }

  if (serpData.videos.length > 0) {
    block += `### Videos (${serpData.videos.length})\n`;
    for (const v of serpData.videos) {
      block += `- **${v.title}** (${v.platform}${v.views ? `, ${v.views} views` : ''})\n  ${v.url}\n`;
    }
    block += '\n';
  }

  return block;
}

export function buildOnboardStrategyPrompt(config: OnboardStrategyConfig): string {
  const prefsBlock = hasPreferences(config.brandPreferences)
    ? '\n' + formatBrandPreferencesBlock(
        config.brandPreferences,
        config.clientName,
        config.industry
      ) + '\n'
    : '';

  const serpBlock = formatSerpBlock(config.serpData);

  return `# CONTENT STRATEGY — FULL BRAND PLAYBOOK

## ROLE
You are a world-class content strategist at a leading digital marketing agency. You are creating a comprehensive content strategy for a new client onboarding. This will be their foundational content playbook — the single document their content team references daily.

## CLIENT PROFILE
- Brand: ${config.clientName}
- Industry: ${config.industry}
- Website: ${config.websiteUrl}
- Target audience: ${config.targetAudience}
- Brand voice: ${config.brandVoice}
- Core topics: ${config.topicKeywords.join(', ')}
${prefsBlock}

## REAL SEARCH DATA
The following was gathered from live searches about this brand's industry and topics. Base all insights on this data — do NOT fabricate information.

${serpBlock}

## OUTPUT FORMAT
Respond ONLY in valid JSON matching this exact schema. No text outside the JSON.

{
  "executive_summary": "4-6 sentence overview of the brand's content opportunity. What makes their niche exciting right now? What's the 30-second pitch for why content will work for them?",

  "audience_analysis": {
    "demographics": "Age ranges, locations, income levels, occupations",
    "psychographics": "Values, interests, lifestyle choices, motivations",
    "online_behavior": "Where they spend time online, what content they consume, when they're active",
    "pain_points": ["Pain point 1", "Pain point 2", "Pain point 3", "Pain point 4"],
    "aspirations": ["What they want to achieve 1", "What they want to achieve 2", "What they want to achieve 3"]
  },

  "content_pillars": [
    {
      "pillar": "Pillar name (3-5 words)",
      "description": "2-3 sentences on why this pillar resonates with the audience and how it serves the brand",
      "example_series": ["Series name 1: description", "Series name 2: description"],
      "frequency": "2-3x per week",
      "formats": ["short-form video", "carousel", "story"],
      "hooks": ["Hook template 1", "Hook template 2", "Hook template 3"]
    }
  ],

  "platform_strategy": [
    {
      "platform": "TikTok",
      "priority": "primary",
      "posting_cadence": "5-7x per week",
      "content_types": ["tutorials", "trending sounds", "behind-the-scenes"],
      "rationale": "Why this platform matters for this brand"
    }
  ],

  "trending_opportunities": [
    {
      "trend": "Trend name",
      "relevance": "Why it matters for ${config.clientName}",
      "urgency": "act_now",
      "content_angle": "Specific angle ${config.clientName} should take",
      "source_url": "URL from search data if available"
    }
  ],

  "video_ideas": [
    {
      "title": "Video title in ${config.clientName}'s voice",
      "hook": "First 3 seconds — what stops the scroll",
      "format": "tutorial | reaction | behind_the_scenes | street_interview | myth_bust | day_in_the_life | ugc_style | before_after | listicle",
      "platform": "TikTok | Instagram Reels | YouTube Shorts | YouTube",
      "estimated_virality": "high",
      "why_it_works": "Why this will resonate with the target audience",
      "pillar": "Which content pillar this falls under"
    }
  ],

  "competitive_landscape": [
    {
      "competitor": "Competitor name or type",
      "strengths": "What they do well",
      "weaknesses": "Where they fall short",
      "gap_opportunity": "What ${config.clientName} can do that they can't or won't"
    }
  ],

  "next_steps": [
    {
      "action": "Specific action item",
      "timeline": "Week 1",
      "priority": "high",
      "category": "content"
    }
  ]
}

## REQUIREMENTS
- executive_summary: 4-6 sentences, inspiring but grounded in data
- audience_analysis: Be specific — real demographics, real online behaviors
- content_pillars: 3-5 pillars, each with 2-3 example series and 3 hook templates
- platform_strategy: 2-4 platforms ranked by priority
- trending_opportunities: 4-8 current trends with urgency levels
- video_ideas: 8-12 ideas spread across pillars, with variety in formats
- competitive_landscape: 3-5 competitors or competitor archetypes
- next_steps: 8-12 actions for the first 30 days, categorized and prioritized
- All video ideas must match the brand voice: ${config.brandVoice}
- urgency values: "act_now", "this_week", "this_month", "ongoing"
- priority values: "high", "medium", "low"
- platform priority: "primary", "secondary", "experimental"
- Do NOT invent URLs — only use URLs from the search data above`;
}
