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

  sections.push(`<brand_context>
You are generating content ideas for ${clientName}, a ${industry} brand.`);

  if (prefs.tone_keywords.length > 0) {
    sections.push(`<tone_and_voice>
The brand's tone should reflect these keywords: ${prefs.tone_keywords.join(', ')}
</tone_and_voice>`);
  }

  if (prefs.topics_lean_into.length > 0 || prefs.topics_avoid.length > 0) {
    sections.push(`<content_priorities>${
      prefs.topics_lean_into.length > 0
        ? `\nTopics to lean into and prioritize: ${prefs.topics_lean_into.join(', ')}`
        : ''
    }${
      prefs.topics_avoid.length > 0
        ? `\nTopics to EXPLICITLY AVOID (do NOT generate ideas about these): ${prefs.topics_avoid.join(', ')}`
        : ''
    }
</content_priorities>`);
  }

  if (prefs.competitor_accounts.length > 0) {
    sections.push(`<competitive_landscape>
The brand watches these competitor accounts for differentiation (do NOT copy their content — use them as context for what the market is doing): ${prefs.competitor_accounts.join(', ')}
</competitive_landscape>`);
  }

  if (prefs.seasonal_priorities.length > 0) {
    sections.push(`<seasonal_context>
Current seasonal priorities: ${prefs.seasonal_priorities.join(', ')}
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
    prefs.tone_keywords.length > 0 ||
    prefs.topics_lean_into.length > 0 ||
    prefs.topics_avoid.length > 0 ||
    prefs.competitor_accounts.length > 0 ||
    prefs.seasonal_priorities.length > 0
  );
}
