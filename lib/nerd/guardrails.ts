/**
 * Nerd Guardrails Engine
 *
 * Pre-LLM message interceptor that pattern-matches sensitive questions
 * and returns exact responses. Handles rephrasing, indirect probing,
 * and jailbreak attempts.
 *
 * Two modes:
 * - short_circuit: return canned response, skip LLM entirely
 * - inject: add instruction to system prompt, LLM still runs
 */

import { createAdminClient } from '@/lib/supabase/admin';

interface GuardrailRule {
  id: string;
  name: string;
  trigger_patterns: string[];
  category: string;
  response: string;
  priority: number;
  mode: 'short_circuit' | 'inject';
}

interface GuardrailResult {
  matched: boolean;
  mode: 'short_circuit' | 'inject' | null;
  response: string | null;
  ruleName: string | null;
}

// In-memory cache with TTL
let cachedRules: GuardrailRule[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Load active guardrail rules from DB, cached in memory.
 */
async function loadRules(): Promise<GuardrailRule[]> {
  const now = Date.now();
  if (cachedRules && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRules;
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('nerd_guardrails')
    .select('id, name, trigger_patterns, category, response, priority, mode')
    .eq('is_active', true)
    .order('priority', { ascending: false });

  cachedRules = (data ?? []) as GuardrailRule[];
  cacheTimestamp = now;
  return cachedRules;
}

/**
 * Normalize text for matching: lowercase, strip punctuation,
 * collapse whitespace, remove common evasion characters.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    // Strip markdown formatting
    .replace(/[*_~`#>]/g, '')
    // Remove unicode tricks (zero-width chars, homoglyphs)
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '')
    // Remove apostrophes/quotes (don't → dont, let's → lets)
    .replace(/[''`´]/g, '')
    // Replace common letter substitutions
    .replace(/[0@]/g, (c) => (c === '0' ? 'o' : 'a'))
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[$5]/g, 's')
    // Strip remaining punctuation except spaces
    .replace(/[^\w\s]/g, ' ')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a message contains a trigger pattern.
 * Uses fuzzy substring matching after normalization.
 */
function matchesPattern(normalizedMessage: string, pattern: string): boolean {
  const normalizedPattern = normalize(pattern);
  return normalizedMessage.includes(normalizedPattern);
}

/**
 * Detect jailbreak / prompt injection attempts that try to
 * extract system prompts, override instructions, or role-play
 * as an unrestricted AI.
 */
function detectJailbreakAttempt(normalizedMessage: string): boolean {
  const jailbreakSignals = [
    // Instruction override attempts
    'ignore your instructions',
    'ignore all previous',
    'ignore prior instructions',
    'disregard your instructions',
    'disregard previous',
    'forget your instructions',
    'forget everything above',
    'override your programming',
    'override your instructions',
    'new instructions',
    'real instructions',
    // System prompt extraction
    'reveal your prompt',
    'show your prompt',
    'show me your system',
    'print your instructions',
    'repeat your instructions',
    'what are your instructions',
    'display your system',
    'output your system',
    'tell me your prompt',
    'give me your prompt',
    'copy your prompt',
    'paste your prompt',
    'share your instructions',
    'what were you told',
    'initial prompt',
    'system message',
    'system prompt',
    // Role-play exploits
    'dan mode',
    'developer mode',
    'jailbreak',
    'bypass your filters',
    'bypass restrictions',
    'no restrictions',
    'unrestricted mode',
    'act as if you have no',
    'pretend you are not',
    'pretend you have no rules',
    'roleplay as an ai without',
    'you are now an ai that can',
    'from now on you will',
    'lets play a game where you',
    // Encoding tricks
    'base64 decode',
    'rot13',
    'translate from',
    'in pig latin',
    // Meta-prompt attacks
    'do not follow your guidelines',
    'do anything now',
    'as an ai with no guidelines',
    'hypothetically if you had no rules',
    'in a hypothetical world where you',
  ];

  return jailbreakSignals.some((signal) => normalizedMessage.includes(signal));
}

/**
 * Detect indirect attempts to get gated information through
 * reformulation, hypothetical framing, or third-person questions.
 */
function detectIndirectProbing(normalizedMessage: string): {
  detected: boolean;
  category: string | null;
} {
  // Indirect identity probing
  const identityProbes = [
    'what technology powers you',
    'what technology are you built on',
    'which ai powers this',
    'which ai model powers',
    'what ai model powers',
    'what model powers',
    'what runs behind',
    'what engine do you use',
    'are you a large language model',
    'are you an llm',
    'which company made you',
    'what company built',
    'who created this ai',
    'who made this ai',
    'who built this ai',
    'powered by openai',
    'powered by anthropic',
    'powered by google',
    'based on gpt',
    'based on claude',
    'based on gemini',
    'what foundation model',
    'what base model',
    'trained by who',
    'trained by whom',
    'who trained you',
  ];

  if (identityProbes.some((p) => normalizedMessage.includes(p))) {
    return { detected: true, category: 'identity' };
  }

  // Indirect agency criticism / firing
  const agencyProbes = [
    'not getting results from my agency',
    'agency isnt performing',
    'agency is not performing',
    'agency doing a bad job',
    'agency doing a bad',
    'agency doing bad',
    'thinking about changing agencies',
    'thinking about switching agencies',
    'considering other agencies',
    'considering switching agencies',
    'how do i know if my agency is good',
    'signs of a bad agency',
    'red flags agency',
    'when to leave your agency',
    'agency accountability',
    'agency not delivering',
    'wasting money on agency',
    'agency roi bad',
    'not happy with my marketing',
    'do i need a different',
    'is there a better agency',
    'hypothetically if someone wanted to fire',
    'friend is thinking about firing their agency',
    'what would you tell someone whose agency',
  ];

  if (agencyProbes.some((p) => normalizedMessage.includes(p))) {
    return { detected: true, category: 'agency_loyalty' };
  }

  // Indirect pricing / internal info
  const internalProbes = [
    'how much would it cost',
    'what is the budget',
    'typical agency pricing',
    'what do agencies like this charge',
    'average retainer',
    'how much should i pay',
    'industry standard pricing',
    'fair price for this',
    'ballpark cost',
    'internal processes',
    'how does nativz work internally',
    'what tools does nativz use',
    'what software does your agency',
  ];

  if (internalProbes.some((p) => normalizedMessage.includes(p))) {
    return { detected: true, category: 'internal_info' };
  }

  return { detected: false, category: null };
}

/**
 * Main guardrails check. Call this before sending to the LLM.
 *
 * Returns:
 * - { matched: false } — no guardrail hit, proceed normally
 * - { matched: true, mode: 'short_circuit', response } — return response directly
 * - { matched: true, mode: 'inject', response } — add to system prompt
 */
export async function checkGuardrails(
  userMessage: string,
  conversationMessages?: Array<{ role: string; content: string }>,
): Promise<GuardrailResult> {
  const normalizedMsg = normalize(userMessage);

  // 1. Check for jailbreak attempts first (highest priority)
  if (detectJailbreakAttempt(normalizedMsg)) {
    return {
      matched: true,
      mode: 'short_circuit',
      response: "I'm The Nerd — I stick to what I do best: social media strategy, content research, and video planning. How can I help with your content today?",
      ruleName: 'jailbreak_detection',
    };
  }

  // 2. Check conversation history for multi-turn manipulation
  if (conversationMessages && conversationMessages.length > 2) {
    const recentUserMsgs = conversationMessages
      .filter((m) => m.role === 'user')
      .slice(-3)
      .map((m) => normalize(m.content));

    // Detect escalating probing across messages
    const allText = recentUserMsgs.join(' ') + ' ' + normalizedMsg;
    if (detectJailbreakAttempt(allText)) {
      return {
        matched: true,
        mode: 'short_circuit',
        response: "I appreciate the curiosity, but I'm built to help with content strategy and video planning. What can I help you create today?",
        ruleName: 'multi_turn_jailbreak',
      };
    }
  }

  // 3. Load DB rules and check direct pattern matches
  const rules = await loadRules();

  for (const rule of rules) {
    for (const pattern of rule.trigger_patterns) {
      if (matchesPattern(normalizedMsg, pattern)) {
        return {
          matched: true,
          mode: rule.mode as 'short_circuit' | 'inject',
          response: rule.response,
          ruleName: rule.name,
        };
      }
    }
  }

  // 4. Check indirect probing (catches reformulated questions)
  const indirect = detectIndirectProbing(normalizedMsg);
  if (indirect.detected && indirect.category) {
    // Find the best rule for this category
    const categoryRule = rules.find((r) => r.category === indirect.category);
    if (categoryRule) {
      return {
        matched: true,
        mode: categoryRule.mode as 'short_circuit' | 'inject',
        response: categoryRule.response,
        ruleName: `indirect_${categoryRule.name}`,
      };
    }
  }

  return { matched: false, mode: null, response: null, ruleName: null };
}

/** Invalidate the cached rules (call after CRUD operations). */
export function invalidateGuardrailsCache(): void {
  cachedRules = null;
  cacheTimestamp = 0;
}
