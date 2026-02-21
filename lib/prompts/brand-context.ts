import type { ClientPreferences } from '@/lib/types/database';

/**
 * Build the <brand_context> block for injection into AI prompts.
 * This is the highest-leverage integration in the codebase —
 * it makes searches brand-specific instead of generic.
 */
export function formatBrandPreferencesBlock(
  prefs: ClientPreferences,
  clientName: string,
  industry: string
): string {
  const sections: string[] = [];

  const toneKeywords = prefs.tone_keywords ?? [];
  const topicsLeanInto = prefs.topics_lean_into ?? [];
  const topicsAvoid = prefs.topics_avoid ?? [];
  const competitorAccounts = prefs.competitor_accounts ?? [];
  const seasonalPriorities = prefs.seasonal_priorities ?? [];

  sections.push(`<brand_context>
You are generating content ideas for ${clientName}, a ${industry} brand.`);

  if (toneKeywords.length > 0) {
    sections.push(`<tone_and_voice>
The brand's tone should reflect these keywords: ${toneKeywords.join(', ')}
</tone_and_voice>`);
  }

  if (topicsLeanInto.length > 0 || topicsAvoid.length > 0) {
    sections.push(`<content_priorities>${
      topicsLeanInto.length > 0
        ? `\nTopics to lean into and prioritize: ${topicsLeanInto.join(', ')}`
        : ''
    }${
      topicsAvoid.length > 0
        ? `\nTopics to EXPLICITLY AVOID (do NOT generate ideas about these): ${topicsAvoid.join(', ')}`
        : ''
    }
</content_priorities>`);
  }

  if (competitorAccounts.length > 0) {
    sections.push(`<competitive_landscape>
The brand watches these competitor accounts for differentiation (do NOT copy their content — use them as context for what the market is doing): ${competitorAccounts.join(', ')}
</competitive_landscape>`);
  }

  if (seasonalPriorities.length > 0) {
    sections.push(`<seasonal_context>
Current seasonal priorities: ${seasonalPriorities.join(', ')}
Today's date: ${new Date().toISOString().split('T')[0]}
</seasonal_context>`);
  }

  sections.push('</brand_context>');
  return sections.join('\n\n');
}

/**
 * Check if brand preferences have any meaningful content.
 */
export function hasPreferences(prefs: ClientPreferences | null | undefined): prefs is ClientPreferences {
  if (!prefs) return false;
  return (
    (prefs.tone_keywords?.length ?? 0) > 0 ||
    (prefs.topics_lean_into?.length ?? 0) > 0 ||
    (prefs.topics_avoid?.length ?? 0) > 0 ||
    (prefs.competitor_accounts?.length ?? 0) > 0 ||
    (prefs.seasonal_priorities?.length ?? 0) > 0
  );
}
