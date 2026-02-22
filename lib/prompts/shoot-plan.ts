import type { BraveSerpData } from '@/lib/brave/types';
import type { ClientPreferences } from '@/lib/types/database';
import { formatBrandPreferencesBlock, hasPreferences } from './brand-context';

interface ShootPlanConfig {
  clientName: string;
  industry: string;
  targetAudience: string;
  brandVoice: string;
  topicKeywords: string[];
  shootDate: string;
  shootTitle: string;
  shootLocation: string | null;
  shootNotes: string | null;
  serpData: BraveSerpData;
  clientMemoryBlock: string;
  brandPreferences?: ClientPreferences | null;
}

function formatSerpBlock(serpData: BraveSerpData): string {
  let block = '';

  if (serpData.webResults.length > 0) {
    block += `### Web results (${serpData.webResults.length})\n`;
    for (const r of serpData.webResults.slice(0, 10)) {
      block += `- **${r.title}**: ${r.description}\n`;
    }
    block += '\n';
  }

  if (serpData.discussions.length > 0) {
    block += `### Discussions (${serpData.discussions.length})\n`;
    for (const d of serpData.discussions.slice(0, 5)) {
      block += `- **${d.title}** (${d.forum}): ${d.description}\n`;
    }
    block += '\n';
  }

  if (serpData.videos.length > 0) {
    block += `### Videos (${serpData.videos.length})\n`;
    for (const v of serpData.videos.slice(0, 5)) {
      block += `- **${v.title}** (${v.platform}${v.views ? `, ${v.views} views` : ''})\n`;
    }
    block += '\n';
  }

  return block;
}

export function buildShootPlanPrompt(config: ShootPlanConfig): string {
  const prefsBlock = hasPreferences(config.brandPreferences)
    ? '\n' + formatBrandPreferencesBlock(config.brandPreferences, config.clientName, config.industry) + '\n'
    : '';

  const serpBlock = formatSerpBlock(config.serpData);
  const shootDate = new Date(config.shootDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `# SHOOT CONTENT PLAN — PRE-PRODUCTION BRIEF

## ROLE
You are a content strategy lead preparing a shoot brief for a videographer. This document tells the videographer exactly what to film, how to film it, and why — so they arrive on set ready to create content that resonates with the audience and aligns with the brand.

## SHOOT DETAILS
- Client: ${config.clientName}
- Industry: ${config.industry}
- Shoot date: ${shootDate}
- Event: ${config.shootTitle}
${config.shootLocation ? `- Location: ${config.shootLocation}` : ''}
${config.shootNotes ? `- Notes: ${config.shootNotes}` : ''}

## CLIENT PROFILE
- Target audience: ${config.targetAudience}
- Brand voice: ${config.brandVoice}
- Core topics: ${config.topicKeywords.join(', ')}
${prefsBlock}

## CLIENT HISTORY
The following is the client's content history — past research, what's been produced, and their existing strategy. Use this to avoid repetition and build on what's working.

${config.clientMemoryBlock}

## CURRENT TRENDS
Fresh data from this week's web searches:

${serpBlock}

## OUTPUT FORMAT
Respond ONLY in valid JSON matching this exact schema:

{
  "overview": "3-4 sentence overview of what this shoot should focus on and why. Reference current trends and past content performance.",

  "client_context": "2-3 sentences summarizing the brand's current content position. What's been working, what hasn't been tried, and what the audience wants.",

  "trending_angles": [
    {
      "topic": "Trending topic name",
      "angle": "The specific angle ${config.clientName} should take",
      "why_now": "Why this is urgent or timely",
      "format": "talking_head | tutorial | behind_the_scenes | street_interview | reaction | before_after | day_in_the_life",
      "estimated_virality": "medium"
    }
  ],

  "shot_list": [
    {
      "title": "Shot name (e.g., 'Morning routine reveal')",
      "description": "What to capture — specific actions, sequences, moments",
      "format": "reel | tiktok | youtube_short | long_form | story | carousel",
      "platform": "TikTok | Instagram | YouTube | Multi-platform",
      "hook": "Opening 3 seconds — what stops the scroll",
      "b_roll_notes": "Specific B-roll shots needed for this piece",
      "priority": "must_have"
    }
  ],

  "content_calendar": [
    {
      "day": "Day 1 (shoot day)",
      "content_title": "Behind the scenes",
      "platform": "Instagram Stories",
      "format": "story",
      "notes": "Post real-time during the shoot"
    }
  ],

  "logistics_notes": [
    "Arrive 30 min early for lighting check",
    "Bring lavalier mic for interview segments"
  ],

  "past_performance_insights": "2-3 sentences analyzing what worked in past content and how this shoot builds on those wins. If no history exists, note this is the client's first shoot and recommend a foundation-building approach."
}

## REQUIREMENTS
- trending_angles: 4-6 angles, each tied to real trend data
- shot_list: 6-10 items ordered by priority (must_have first, then nice_to_have, then bonus)
- content_calendar: 5-7 posts covering shoot day + 2 weeks of post-production content
- logistics_notes: 4-8 practical items the videographer needs to know
- Do NOT repeat content the client has already produced (check <content_produced> above)
- All content should match the brand voice: ${config.brandVoice}
- Include a mix of formats for platform diversity
- Shot priorities: "must_have" (the core pieces), "nice_to_have" (if time allows), "bonus" (opportunistic)
- estimated_virality: "low", "medium", "high", "viral_potential"`;
}
