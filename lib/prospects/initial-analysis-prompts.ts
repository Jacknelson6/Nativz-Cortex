// SPY-03 T05: prompt builders + Zod output schemas for the four LLM
// calls in the initial-analysis pipeline. Kept in one module so changes
// are reviewable in a single diff and snapshot tests can import all
// builders at once.
//
// Voice rules per PRD: confident, plainspoken, sentence-case, no em
// dashes, no marketing fluff. Banned topics: politics, religion, health
// claims, weight-loss claims, competitor disparagement.

import { z } from 'zod';

// ── Profile pic (Gemini 2.5 Flash Vision) ────────────────────────────────────

export const ProfilePicSchema = z.object({
  rating: z.enum(['good', 'okay', 'weak']),
  note: z.string().min(1).max(140),
});
export type ProfilePicOutput = z.infer<typeof ProfilePicSchema>;

export const PROFILE_PIC_SYSTEM = `You are a brand-design reviewer for short-form video creators. You will receive a profile picture image plus the brand name. Return one JSON object with fields rating (good|okay|weak), note (one sentence, max 140 chars, no em dash).

Criteria for good: clear subject, readable at small size, on-brand colours, professional.
Criteria for weak: blurry, illegible at thumbnail size, off-brand, generic stock.
Avoid: politics, religion, body-shaming, weight loss claims, health claims. If image is missing return rating=weak, note="No profile picture set."`;

export function buildProfilePicPrompt(opts: {
  brandName: string;
  platform: string;
  handle: string;
}): string {
  return `Brand: ${opts.brandName}
Platform: ${opts.platform}
Handle: @${opts.handle}
Image: <attached>`;
}

// ── Bio (Sonnet 4.5) ─────────────────────────────────────────────────────────

export const BioSchema = z.object({
  hook: z.string().max(280).nullable(),
  cta: z.string().max(280).nullable(),
  rating: z.enum(['good', 'okay', 'weak']),
  note: z.string().min(1).max(200),
});
export type BioOutput = z.infer<typeof BioSchema>;

export const BIO_SYSTEM = `You analyse short-form video creator bios. A good bio has a clear hook (first line), a clear CTA (link or action), and a consistent handle pattern. Return JSON: hook (verbatim first line or null if none stands out), cta (verbatim CTA or null), rating (good|okay|weak), note (one sentence, max 200 chars, no em dash).

Banned: politics, religion, health claims, weight loss claims.`;

export function buildBioPrompt(opts: {
  brandName: string;
  platform: string;
  bioText: string;
}): string {
  return `Brand: ${opts.brandName}
Platform: ${opts.platform}
Bio text:
"""
${opts.bioText || '(empty)'}
"""`;
}

// ── Caption pattern (Sonnet 4.5) ─────────────────────────────────────────────

export const CaptionPatternSchema = z.object({
  hook_quality_avg: z.number().min(0).max(1),
  cta_rate: z.number().min(0).max(1),
  voice_note: z.string().min(1).max(200),
});
export type CaptionPatternOutput = z.infer<typeof CaptionPatternSchema>;

export const CAPTION_SYSTEM = `You analyse a batch of recent video captions from one short-form creator. For each caption, score the hook quality (0 to 1) and whether a CTA is present. Then summarise voice in one sentence. Return JSON with hook_quality_avg (number 0 to 1), cta_rate (number 0 to 1), voice_note (max 200 chars, no em dash).

Banned: politics, religion, health claims, weight loss, competitor disparagement.`;

export function buildCaptionPrompt(opts: {
  brandName: string;
  platform: string;
  captions: string[];
}): string {
  const numbered = opts.captions
    .slice(0, 15)
    .map((c, i) => `${i + 1}. ${c.replace(/\s+/g, ' ').slice(0, 240)}`)
    .join('\n');
  return `Brand: ${opts.brandName}
Platform: ${opts.platform}
Captions:
${numbered || '(no captions found)'}`;
}

// ── Comment signal (Sonnet 4.5) ──────────────────────────────────────────────

export const CommentSignalSchema = z.object({
  sentiment_score: z.number().min(-1).max(1),
  recurring_themes: z.array(z.string().max(80)).min(0).max(8),
  reply_rate: z.number().min(0).max(1),
});
export type CommentSignalOutput = z.infer<typeof CommentSignalSchema>;

export const COMMENT_SYSTEM = `You analyse the sentiment and recurring themes in a sample of top-level comments on a creator's recent posts. Return JSON with sentiment_score (-1 to 1; positive is supportive), recurring_themes (3 to 5 short noun phrases), reply_rate (number 0 to 1 indicating how often the creator replied to commenters; rely on the input to determine this). No em dash. Banned: politics, religion, health claims.`;

export function buildCommentPrompt(opts: {
  brandName: string;
  platform: string;
  comments: Array<{ text: string; isCreatorReply?: boolean }>;
}): string {
  const lines = opts.comments
    .slice(0, 50)
    .map((c) => `${c.isCreatorReply ? '[REPLY] ' : ''}${c.text.replace(/\s+/g, ' ').slice(0, 240)}`)
    .join('\n');
  return `Creator: ${opts.brandName}
Platform: ${opts.platform}
Comments (one per line, creator replies marked with [REPLY]):
${lines || '(no comments scraped)'}`;
}

// ── Rollup (Sonnet 4.5) ──────────────────────────────────────────────────────

export const RollupSchema = z.object({
  observations: z.array(z.string().min(8).max(140)).min(3).max(5),
  biggest_opportunity: z.string().min(40).max(280),
});
export type RollupOutput = z.infer<typeof RollupSchema>;

export const ROLLUP_SYSTEM = `You synthesize a short-form-creator audit into 3 to 5 concrete observations and one biggest opportunity. Each observation: imperative, specific, max 140 chars, no em dash. Biggest opportunity: one paragraph max 280 chars, frame as growth lever (not criticism). Banned: politics, religion, health claims, weight loss claims, competitor disparagement.

Voice: confident, plainspoken, concrete. No marketing fluff ("synergy", "leverage", "10x"). Sentence case.`;

export function buildRollupPrompt(opts: {
  brandName: string;
  platform: string;
  profilePicSummary: string;
  bioSummary: string;
  captionSummary: string;
  commentSummary: string;
  cadenceSummary: string;
}): string {
  return `Brand: ${opts.brandName}
Platform: ${opts.platform}
Profile pic: ${opts.profilePicSummary}
Bio: ${opts.bioSummary}
Caption pattern: ${opts.captionSummary}
Comment signal: ${opts.commentSummary}
Posting cadence: ${opts.cadenceSummary}`;
}

// ── Banned-topic post-validation ─────────────────────────────────────────────

const BANNED_RE = /\b(abortion|religion|weight loss|miracle cure|diet pill|conservative|liberal|democrat|republican)\b/i;

export function containsBannedTopic(text: string | null | undefined): boolean {
  if (!text) return false;
  return BANNED_RE.test(text);
}
