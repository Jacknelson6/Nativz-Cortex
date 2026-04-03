import type { LegacyTrendingTopic, TrendingTopic } from '@/lib/types/search';
import { getTopicReachValue } from '@/lib/search/topic-metrics';

/**
 * One-line copy connecting aggregate topic metrics to why a generated idea fits the data.
 */
export function getResearchAlignmentHint(topic: TrendingTopic | LegacyTrendingTopic): string {
  const sentiment = topic.sentiment;
  const resonance = topic.resonance;
  const reach = getTopicReachValue(topic);

  const sParts: string[] = [];
  if (sentiment >= 0.35) {
    sParts.push('Audience mood in this topic’s data is strongly positive — affirmation and “worth it” angles align.');
  } else if (sentiment >= 0.1) {
    sParts.push('Sentiment leans positive — discovery and comparison formats match the signal.');
  } else if (sentiment <= -0.35) {
    sParts.push('Sentiment skews negative — fix-it, comparison, and expectation-vs-reality hooks match the tension.');
  } else if (sentiment <= -0.1) {
    sParts.push('Some frustration shows in the blend — honest reviews and myth-busting fit the data.');
  } else {
    sParts.push('Sentiment is mixed — contrasting takes and A/B angles map well to the overview.');
  }

  if (resonance === 'viral' || resonance === 'high') {
    sParts.push('Resonance is high in this search — the theme has stronger momentum than typical rows.');
  }

  if (reach >= 100_000) {
    sParts.push('Blended engagement across sources is large — traction is visible in the numbers.');
  } else if (reach >= 10_000) {
    sParts.push('Engagement is solid — enough signal to treat the topic as validated, not speculative.');
  }

  return sParts.join(' ');
}
