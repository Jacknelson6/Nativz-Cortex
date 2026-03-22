import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import type { CrawledPage } from './types';

export interface VerbalIdentityAnalysis {
  tonePrimary: string;
  voiceAttributes: string[];
  messagingPillars: string[];
  vocabularyPatterns: string[];
  avoidancePatterns: string[];
  targetAudienceSummary: string;
  competitivePositioning: string;
}

/**
 * Analyze verbal identity from crawled page content using AI.
 * Sends homepage, about page, and product pages to Claude for tone/voice analysis.
 */
export async function analyzeVerbalIdentity(pages: CrawledPage[]): Promise<VerbalIdentityAnalysis | null> {
  // Select the most relevant pages for voice analysis
  const homepage = pages.find((p) => p.pageType === 'homepage');
  const aboutPage = pages.find((p) => p.pageType === 'about');
  const productPages = pages.filter((p) => p.pageType === 'product').slice(0, 3);
  const selectedPages = [homepage, aboutPage, ...productPages].filter(Boolean) as CrawledPage[];

  if (selectedPages.length === 0) return null;

  const contentBlock = selectedPages
    .map((p) => `### ${p.pageType.toUpperCase()} — ${p.url}\n${p.content.slice(0, 3000)}`)
    .join('\n\n---\n\n');

  const systemPrompt = `You are a brand strategist analyzing a company's website content to extract their verbal identity. Analyze the text below and return a JSON object with exactly these fields:

{
  "tone_primary": "2-3 word tone description (e.g., 'conversational and empowering', 'professional and authoritative')",
  "voice_attributes": ["5-7 specific voice characteristics, e.g., 'uses second person', 'short punchy sentences', 'action verbs', 'inclusive language'"],
  "messaging_pillars": ["3-5 recurring themes/messages across the content"],
  "vocabulary_patterns": ["5-10 frequently used words, phrases, or power words"],
  "avoidance_patterns": ["3-5 things the brand does NOT do in their copy, e.g., 'no technical jargon', 'avoids passive voice', 'never uses fear-based language'"],
  "target_audience_summary": "2-3 sentences describing who this brand is talking to, based on language signals",
  "competitive_positioning": "2-3 sentences on how this brand differentiates itself, inferred from messaging"
}

Output ONLY the JSON object. No other text.`;

  try {
    const result = await createCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contentBlock },
      ],
      maxTokens: 2000,
      feature: 'brand_dna_verbal',
    });

    const parsed = parseAIResponseJSON<Record<string, unknown>>(result.text);
    return {
      tonePrimary: (parsed.tone_primary as string) ?? '',
      voiceAttributes: (parsed.voice_attributes as string[]) ?? [],
      messagingPillars: (parsed.messaging_pillars as string[]) ?? [],
      vocabularyPatterns: (parsed.vocabulary_patterns as string[]) ?? [],
      avoidancePatterns: (parsed.avoidance_patterns as string[]) ?? [],
      targetAudienceSummary: (parsed.target_audience_summary as string) ?? '',
      competitivePositioning: (parsed.competitive_positioning as string) ?? '',
    };
  } catch (err) {
    console.error('[brand-dna] Verbal identity analysis failed:', err);
    return null;
  }
}
