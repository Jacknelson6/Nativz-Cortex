/**
 * Analytics engine — computes structured search metrics from raw platform data
 * without using an LLM. Handles sentiment, emotions, intensity, platform breakdown,
 * trending topic detection, and content breakdown.
 *
 * The LLM is only used for narrative summary + creative video ideas.
 */

import type {
  PlatformSource,
  PlatformComment,
  PlatformBreakdown,
  ConversationTheme,
  EmotionBreakdown,
  ContentBreakdown,
  ContentBreakdownItem,
  SearchPlatform,
  TopicSource,
} from '@/lib/types/search';
import type { BraveSerpData } from '@/lib/brave/types';

// ── Sentiment analysis (keyword-based) ───────────────────────────────────────

const POSITIVE_WORDS = new Set([
  'love', 'great', 'amazing', 'awesome', 'best', 'excellent', 'perfect', 'fantastic',
  'wonderful', 'beautiful', 'incredible', 'brilliant', 'outstanding', 'superb',
  'recommend', 'favorite', 'helpful', 'impressed', 'enjoy', 'happy', 'excited',
  'delicious', 'smooth', 'refreshing', 'clean', 'fire', 'goated', 'underrated',
  'worth', 'solid', 'obsessed', 'genius', 'elite', 'game-changer', 'addicting',
]);

const NEGATIVE_WORDS = new Set([
  'hate', 'terrible', 'awful', 'worst', 'horrible', 'disgusting', 'disappointing',
  'bad', 'poor', 'trash', 'garbage', 'waste', 'overrated', 'scam', 'avoid',
  'annoying', 'boring', 'ugly', 'broken', 'useless', 'expensive', 'nasty',
  'gross', 'mid', 'toxic', 'cringe', 'sus', 'overpriced', 'misleading',
  'recalled', 'contaminated', 'dangerous', 'warning', 'lawsuit',
]);

function analyzeSentiment(text: string): number {
  const words = text.toLowerCase().split(/\W+/);
  let pos = 0, neg = 0;
  for (const w of words) {
    if (POSITIVE_WORDS.has(w)) pos++;
    if (NEGATIVE_WORDS.has(w)) neg++;
  }
  const total = pos + neg;
  if (total === 0) return 0;
  return Math.round(((pos - neg) / total) * 100) / 100;
}

// ── Emotion detection (keyword mapping) ──────────────────────────────────────

const EMOTION_KEYWORDS: Record<string, { words: string[]; color: string }> = {
  'Curiosity': { words: ['how', 'why', 'what', 'wondering', 'anyone', 'thoughts', 'question', 'curious', 'does anyone', 'help'], color: '#6366F1' },
  'Excitement': { words: ['excited', 'amazing', 'love', 'awesome', 'fire', 'hype', 'lets go', 'finally', 'game changer', 'obsessed'], color: '#10B981' },
  'Frustration': { words: ['annoying', 'frustrated', 'hate', 'wish', 'disappointed', 'ugh', 'tired', 'broken', 'terrible', 'stop'], color: '#EF4444' },
  'Humor': { words: ['lol', 'lmao', 'haha', 'funny', 'dead', 'bruh', 'joke', 'hilarious', 'crying', 'meme'], color: '#F59E0B' },
  'Surprise': { words: ['wow', 'omg', 'wait', 'what', 'shocked', 'unexpected', 'never knew', 'mind blown', 'didnt know', 'crazy'], color: '#8B5CF6' },
  'Trust': { words: ['recommend', 'trust', 'reliable', 'proven', 'honest', 'legit', 'verified', 'authentic', 'real', 'quality'], color: '#3B82F6' },
  'Nostalgia': { words: ['remember', 'classic', 'throwback', 'miss', 'back in', 'old school', 'used to', 'childhood', 'retro', 'og'], color: '#EC4899' },
  'FOMO': { words: ['need', 'must try', 'everyone', 'trending', 'viral', 'sold out', 'limited', 'hurry', 'before its gone', 'dont miss'], color: '#14B8A6' },
};

function detectEmotions(texts: string[]): EmotionBreakdown[] {
  const counts: Record<string, number> = {};
  const combined = texts.join(' ').toLowerCase();

  for (const [emotion, { words }] of Object.entries(EMOTION_KEYWORDS)) {
    let count = 0;
    for (const w of words) {
      const regex = new RegExp(`\\b${w.replace(/\s+/g, '\\s+')}\\b`, 'gi');
      const matches = combined.match(regex);
      count += matches?.length ?? 0;
    }
    if (count > 0) counts[emotion] = count;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return [
      { emotion: 'Curiosity', percentage: 40, color: '#6366F1' },
      { emotion: 'Excitement', percentage: 30, color: '#10B981' },
      { emotion: 'Trust', percentage: 30, color: '#3B82F6' },
    ];
  }

  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([emotion, count]) => ({
      emotion,
      percentage: Math.round((count / total) * 100),
      color: EMOTION_KEYWORDS[emotion].color,
    }));
}

// ── Conversation intensity ───────────────────────────────────────────────────

function computeIntensity(totalSources: number, totalComments: number): 'low' | 'moderate' | 'high' | 'very_high' {
  const score = totalSources + totalComments * 0.5;
  if (score > 500) return 'very_high';
  if (score > 150) return 'high';
  if (score > 50) return 'moderate';
  return 'low';
}

// ── Topic extraction (TF-IDF-like frequency analysis) ────────────────────────

const STOP_WORDS = new Set([
  // Standard English stop words
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'about',
  'between', 'after', 'before', 'above', 'below', 'it', 'its', 'this',
  'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
  'he', 'she', 'they', 'them', 'what', 'which', 'who', 'when', 'where',
  'how', 'not', 'no', 'nor', 'but', 'or', 'and', 'so', 'if', 'just',
  'than', 'too', 'very', 'also', 'more', 'some', 'all', 'any', 'each',
  'every', 'both', 'few', 'most', 'other', 'such', 'only', 'own', 'same',
  'get', 'got', 'like', 'one', 'two', 'new', 'use', 'way', 'make',
  'know', 'think', 'see', 'look', 'go', 'come', 'take', 'want', 'give',
  'first', 'last', 'long', 'great', 'little', 'right', 'big', 'high',
  'old', 'good', 'much', 'really', 'even', 'still', 'back', 'well',
  // Recipe / measurement / ingredient generic terms
  'tsp', 'tbsp', 'cup', 'cups', 'tablespoon', 'teaspoon', 'ounce', 'ounces',
  'pound', 'pounds', 'gram', 'grams', 'lbs', 'oz', 'ml', 'liter',
  'powder', 'salt', 'pepper', 'sugar', 'oil', 'water', 'butter', 'flour',
  'garlic', 'onion', 'sauce', 'cream', 'cheese', 'chicken', 'beef', 'rice',
  'add', 'mix', 'stir', 'cook', 'bake', 'heat', 'serve', 'cut', 'chop',
  'medium', 'large', 'small', 'fresh', 'minutes', 'minute', 'hour', 'hours',
  'recipe', 'recipes', 'ingredients', 'ingredient',
  // Common non-topic words in social media
  'video', 'videos', 'watch', 'watching', 'share', 'shared', 'comment',
  'comments', 'follow', 'subscribe', 'link', 'check', 'post', 'posted',
  'part', 'full', 'show', 'day', 'week', 'month', 'year', 'time', 'today',
  'best', 'top', 'try', 'tried', 'using', 'used', 'per', 'via', 'here',
  'thing', 'things', 'need', 'needs', 'help', 'want', 'going', 'made',
  'many', 'work', 'works', 'working', 'started', 'start', 'found', 'find',
  'put', 'keep', 'let', 'say', 'said', 'tell', 'told', 'ask', 'asked',
  'lot', 'bit', 'kind', 'pretty', 'actually', 'literally', 'basically',
  'dont', 'ive', 'im', 'its', 'thats', 'youre',
  // URL fragments
  'http', 'https', 'www', 'com', 'org', 'net', 'edu', 'gov', 'html', 'php',
  'asp', 'jsp', 'htm', 'url', 'link', 'site', 'page', 'blog',
  // Platform / format noise
  'shorts', 'short', 'reels', 'reel', 'tiktok', 'youtube', 'instagram',
  'reddit', 'quora', 'twitter', 'facebook', 'clip', 'clips', 'content',
  'posts', 'channel', 'likes', 'views', 'viral', 'trending',
  // Common noise
  'people', 'really', 'getting', 'making', 'trying', 'looking', 'saying',
  'talking', 'feeling', 'stuff', 'often', 'usually', 'never', 'always',
  'still', 'right', 'wrong',
]);

interface ExtractedTopic {
  name: string;
  frequency: number;
  avgSentiment: number;
  sources: TopicSource[];
  platforms: Set<SearchPlatform>;
  sampleTexts: string[];
  totalEngagement: number;
}

function extractTopics(
  sources: PlatformSource[],
  serpData: BraveSerpData,
  query: string,
): ExtractedTopic[] {
  // Build bigrams from titles and content
  const bigramCounts = new Map<string, { count: number; sentiment: number; sources: TopicSource[]; platforms: Set<SearchPlatform>; texts: string[]; engagement: number }>();
  const queryWords = new Set(query.toLowerCase().split(/\W+/));

  for (const source of sources) {
    const text = `${source.title} ${source.content}`.toLowerCase();
    const words = text.split(/\W+/).filter(w => w.length > 2 && !STOP_WORDS.has(w) && !queryWords.has(w));

    // Extract bigrams
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      const existing = bigramCounts.get(bigram);
      const engagement = (source.engagement.views ?? 0) + (source.engagement.likes ?? 0) * 10 + (source.engagement.comments ?? 0) * 5;

      if (existing) {
        existing.count++;
        existing.sentiment += analyzeSentiment(source.title);
        existing.platforms.add(source.platform);
        existing.engagement += engagement;
        if (existing.texts.length < 3) existing.texts.push(source.title);
        if (existing.sources.length < 5) {
          existing.sources.push({
            url: source.url,
            title: source.title,
            type: source.platform === 'web' ? 'web' : source.platform === 'reddit' || source.platform === 'quora' ? 'discussion' : 'video',
            relevance: `${source.engagement.views ?? source.engagement.score ?? 0} engagement`,
            platform: source.platform,
          });
        }
      } else {
        bigramCounts.set(bigram, {
          count: 1,
          sentiment: analyzeSentiment(source.title),
          sources: [{
            url: source.url,
            title: source.title,
            type: source.platform === 'web' ? 'web' : source.platform === 'reddit' || source.platform === 'quora' ? 'discussion' : 'video',
            relevance: `${source.engagement.views ?? source.engagement.score ?? 0} engagement`,
            platform: source.platform,
          }],
          platforms: new Set([source.platform]),
          texts: [source.title],
          engagement,
        });
      }
    }
  }

  // Also add topics from web SERP data
  for (const r of serpData.webResults) {
    const text = `${r.title} ${r.description}`.toLowerCase();
    const words = text.split(/\W+/).filter(w => w.length > 2 && !STOP_WORDS.has(w) && !queryWords.has(w));
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      const existing = bigramCounts.get(bigram);
      if (existing) {
        existing.count++;
        existing.platforms.add('web');
        if (existing.sources.length < 5) {
          existing.sources.push({ url: r.url, title: r.title, type: 'web', relevance: 'Web result', platform: 'web' });
        }
      }
    }
  }

  // Helper: detect URL-like components in a word
  const COMMON_TLDS = new Set(['com', 'org', 'net', 'edu', 'gov', 'io', 'co', 'us', 'uk', 'ca', 'au', 'de']);
  function looksLikeUrl(word: string): boolean {
    if (word.includes('.')) return true;
    if (word.startsWith('http')) return true;
    if (COMMON_TLDS.has(word)) return true;
    return false;
  }

  // Filter: require minimum frequency, cross-platform presence preferred,
  // and at least one word that's 4+ chars (filters out "tsp garlic" type noise)
  return Array.from(bigramCounts.entries())
    .filter(([name, data]) => {
      if (data.count < 3) return false;
      // Both words must be 3+ chars
      const words = name.split(' ');
      if (words.some(w => w.length < 3)) return false;
      // At least one word must be 5+ chars (filters "tsp oil", "per cup" etc.)
      if (!words.some(w => w.length >= 5)) return false;
      // Strip bigrams where either word looks like a URL component
      if (words.some(w => looksLikeUrl(w))) return false;
      // Require at least 2 unique sources (not just repetition in one post)
      if (data.sources.length < 2) return false;
      return true;
    })
    .sort((a, b) => (b[1].count * b[1].engagement) - (a[1].count * a[1].engagement))
    .slice(0, 8)
    .map(([name, data]) => ({
      name: name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      frequency: data.count,
      avgSentiment: Math.round((data.sentiment / data.count) * 100) / 100,
      sources: data.sources,
      platforms: data.platforms,
      sampleTexts: data.texts,
      totalEngagement: data.engagement,
    }));
}

// ── Resonance calculation ────────────────────────────────────────────────────

function computeResonance(frequency: number, engagement: number): 'low' | 'medium' | 'high' | 'viral' {
  const score = frequency * 2 + Math.log10(Math.max(engagement, 1));
  if (score > 20) return 'viral';
  if (score > 12) return 'high';
  if (score > 6) return 'medium';
  return 'low';
}

// ── Content breakdown ────────────────────────────────────────────────────────

function computeContentBreakdown(sources: PlatformSource[]): ContentBreakdown {
  const formatCounts: Record<string, { count: number; engagement: number }> = {};
  const categoryCounts: Record<string, { count: number; engagement: number }> = {};
  const intentionCounts: Record<string, { count: number; engagement: number }> = {};

  for (const source of sources) {
    const text = `${source.title} ${source.content}`.toLowerCase();
    const engagement = (source.engagement.views ?? 0) + (source.engagement.likes ?? 0) * 10;

    // Detect formats
    if (source.platform === 'youtube' || source.platform === 'tiktok') {
      formatCounts['Short-form video'] = formatCounts['Short-form video'] || { count: 0, engagement: 0 };
      formatCounts['Short-form video'].count++;
      formatCounts['Short-form video'].engagement += engagement;
    } else if (source.platform === 'reddit' || source.platform === 'quora') {
      formatCounts['Discussion thread'] = formatCounts['Discussion thread'] || { count: 0, engagement: 0 };
      formatCounts['Discussion thread'].count++;
      formatCounts['Discussion thread'].engagement += engagement;
    } else {
      formatCounts['Article / blog'] = formatCounts['Article / blog'] || { count: 0, engagement: 0 };
      formatCounts['Article / blog'].count++;
      formatCounts['Article / blog'].engagement += engagement;
    }

    // Detect categories from keywords
    const cats: [string, string[]][] = [
      ['How-to / Tutorial', ['how to', 'tutorial', 'guide', 'step by step', 'tips', 'hack', 'learn']],
      ['Review / Comparison', ['review', 'comparison', 'vs', 'versus', 'best', 'top', 'ranking', 'rated']],
      ['News / Update', ['new', 'update', 'announcement', 'launch', 'recall', 'breaking', 'report']],
      ['Entertainment', ['funny', 'meme', 'trend', 'viral', 'challenge', 'prank', 'comedy']],
      ['Opinion / Discussion', ['opinion', 'thoughts', 'debate', 'unpopular', 'hot take', 'rant']],
    ];
    for (const [cat, keywords] of cats) {
      if (keywords.some(k => text.includes(k))) {
        categoryCounts[cat] = categoryCounts[cat] || { count: 0, engagement: 0 };
        categoryCounts[cat].count++;
        categoryCounts[cat].engagement += engagement;
      }
    }

    // Detect viewer intentions
    const intents: [string, string[]][] = [
      ['To learn something new', ['how', 'learn', 'tutorial', 'guide', 'explain', 'tips']],
      ['For entertainment', ['funny', 'meme', 'viral', 'trend', 'lol', 'comedy']],
      ['To make a purchase decision', ['review', 'worth it', 'buy', 'recommend', 'best', 'vs']],
      ['To stay informed', ['news', 'update', 'report', 'recall', 'announcement']],
      ['To feel inspired', ['inspired', 'motivation', 'amazing', 'beautiful', 'creative']],
    ];
    for (const [intent, keywords] of intents) {
      if (keywords.some(k => text.includes(k))) {
        intentionCounts[intent] = intentionCounts[intent] || { count: 0, engagement: 0 };
        intentionCounts[intent].count++;
        intentionCounts[intent].engagement += engagement;
      }
    }
  }

  function toBreakdownItems(counts: Record<string, { count: number; engagement: number }>): ContentBreakdownItem[] {
    const total = Object.values(counts).reduce((sum, v) => sum + v.count, 0) || 1;
    const totalEng = Object.values(counts).reduce((sum, v) => sum + v.engagement, 0) || 1;
    return Object.entries(counts)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 5)
      .map(([name, data]) => ({
        name,
        percentage: Math.round((data.count / total) * 100),
        engagement_rate: Math.round((data.engagement / totalEng) * 1000) / 1000,
      }));
  }

  return {
    formats: toBreakdownItems(formatCounts),
    categories: toBreakdownItems(categoryCounts),
    intentions: toBreakdownItems(intentionCounts),
  };
}

// ── Platform breakdown ───────────────────────────────────────────────────────

function computePlatformBreakdown(
  sources: PlatformSource[],
  platformStats: { platform: SearchPlatform; postCount: number; commentCount: number; topSubreddits?: string[]; topChannels?: string[]; topHashtags?: string[] }[],
): PlatformBreakdown[] {
  return platformStats.map(stat => {
    const platformSources = sources.filter(s => s.platform === stat.platform);
    const allText = platformSources.map(s => `${s.title} ${s.content} ${s.comments.map(c => c.text).join(' ')}`).join(' ');
    const sentiment = analyzeSentiment(allText);

    return {
      platform: stat.platform,
      post_count: stat.postCount,
      comment_count: stat.commentCount,
      avg_sentiment: sentiment,
      ...(stat.topSubreddits && { top_subreddits: stat.topSubreddits }),
      ...(stat.topChannels && { top_channels: stat.topChannels }),
      ...(stat.topHashtags && { top_hashtags: stat.topHashtags }),
    };
  });
}

// ── Conversation themes (cross-platform) ─────────────────────────────────────

function extractConversationThemes(sources: PlatformSource[]): ConversationTheme[] {
  // Group sources by common keywords to find cross-platform themes
  const themeMap = new Map<string, { posts: PlatformSource[]; platforms: Set<SearchPlatform> }>();

  for (const source of sources) {
    const words = source.title.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !STOP_WORDS.has(w));
    for (const word of words) {
      const existing = themeMap.get(word);
      if (existing) {
        if (existing.posts.length < 20) existing.posts.push(source);
        existing.platforms.add(source.platform);
      } else {
        themeMap.set(word, { posts: [source], platforms: new Set([source.platform]) });
      }
    }
  }

  // Only keep themes that span multiple platforms
  return Array.from(themeMap.entries())
    .filter(([, data]) => data.platforms.size >= 2 && data.posts.length >= 3)
    .sort((a, b) => b[1].posts.length - a[1].posts.length)
    .slice(0, 5)
    .map(([keyword, data]) => {
      const allText = data.posts.map(p => `${p.title} ${p.content}`).join(' ');
      const quotes = data.posts
        .flatMap(p => p.comments.map(c => c.text))
        .filter(t => t.length > 20 && t.length < 200)
        .slice(0, 3);

      return {
        theme: keyword.charAt(0).toUpperCase() + keyword.slice(1),
        post_count: data.posts.length,
        sentiment: analyzeSentiment(allText),
        platforms: Array.from(data.platforms),
        representative_quotes: quotes.length > 0 ? quotes : [`Discussion about ${keyword} across ${data.platforms.size} platforms`],
      };
    });
}

// ── Big movers detection ─────────────────────────────────────────────────────

interface BigMover {
  name: string;
  type: 'brand' | 'creator' | 'product' | 'company';
  url: string | null;
  why: string;
  tactics: string[];
  takeaway: string;
}

function detectBigMovers(sources: PlatformSource[]): BigMover[] {
  // Count mentions of authors/creators by frequency + engagement
  const authorCounts = new Map<string, { count: number; engagement: number; urls: string[]; platforms: Set<string> }>();

  for (const source of sources) {
    if (!source.author || source.author === '[deleted]' || source.author.length < 2) continue;
    const engagement = (source.engagement.views ?? 0) + (source.engagement.likes ?? 0) * 10;
    const existing = authorCounts.get(source.author);
    if (existing) {
      existing.count++;
      existing.engagement += engagement;
      if (existing.urls.length < 3) existing.urls.push(source.url);
      existing.platforms.add(source.platform);
    } else {
      authorCounts.set(source.author, { count: 1, engagement, urls: [source.url], platforms: new Set([source.platform]) });
    }
  }

  return Array.from(authorCounts.entries())
    .filter(([, data]) => data.count >= 2)
    .sort((a, b) => (b[1].engagement * b[1].count) - (a[1].engagement * a[1].count))
    .slice(0, 5)
    .map(([name, data]) => ({
      name,
      type: (data.platforms.has('youtube') || data.platforms.has('tiktok') ? 'creator' : 'brand') as BigMover['type'],
      url: data.urls[0] ?? null,
      why: `Appears in ${data.count} sources with ${Math.round(data.engagement).toLocaleString()} total engagement`,
      tactics: [`Active on ${Array.from(data.platforms).join(', ')}`, `${data.count} pieces of content found`, `High engagement ratio`],
      takeaway: `Study their content format and posting strategy for replication opportunities`,
    }));
}

// ── Main export: compute all analytics ───────────────────────────────────────

export interface ComputedAnalytics {
  overall_sentiment: number;
  conversation_intensity: 'low' | 'moderate' | 'high' | 'very_high';
  emotions: EmotionBreakdown[];
  content_breakdown: ContentBreakdown;
  platform_breakdown: PlatformBreakdown[];
  conversation_themes: ConversationTheme[];
  big_movers: BigMover[];
  extracted_topics: ExtractedTopic[];
}

export function computeAnalytics(
  sources: PlatformSource[],
  serpData: BraveSerpData,
  platformStats: { platform: SearchPlatform; postCount: number; commentCount: number; topSubreddits?: string[]; topChannels?: string[]; topHashtags?: string[] }[],
  query: string,
): ComputedAnalytics {
  // Gather all text for sentiment/emotion analysis
  const allTexts = sources.flatMap(s => [
    s.title,
    s.content,
    ...s.comments.map(c => c.text),
  ]);

  const totalComments = sources.reduce((sum, s) => sum + s.comments.length, 0);

  return {
    overall_sentiment: analyzeSentiment(allTexts.join(' ')),
    conversation_intensity: computeIntensity(sources.length, totalComments),
    emotions: detectEmotions(allTexts),
    content_breakdown: computeContentBreakdown(sources),
    platform_breakdown: computePlatformBreakdown(sources, platformStats),
    conversation_themes: extractConversationThemes(sources),
    big_movers: detectBigMovers(sources),
    extracted_topics: extractTopics(sources, serpData, query),
  };
}
