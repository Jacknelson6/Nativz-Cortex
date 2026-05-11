// SPY-04 T06/T07: deterministic 10-item checklist + computeScorecard().
//
// Foundation note: PRD asks for 10 separate files under
// lib/prospects/checklist-rules/*.ts. Consolidated here as 10 pure
// inline functions to keep the diff reviewable and the rule ordering
// obvious. If/when a rule grows non-trivial logic (e.g. hashtag/content
// variety derivation from raw_captions clustering), pull just that one
// rule into its own module — the inline functions are already named so
// the move is mechanical.
//
// Override semantics (PRD D-05): rule output is merged with
// `analysis.overrides.checklist_overrides`. Override wins; `overridden`
// flag flips true.
//
// LLM is NOT in the grading loop — every rule is a pure function over
// ProspectAnalysisRow fields. Missing inputs → score='na'.

import type { ProspectAnalysisRow } from './types';

export type ChecklistItemId =
  | 'bio_optimized'
  | 'profile_pic_pro'
  | 'cadence_consistent'
  | 'caption_hooks'
  | 'caption_ctas'
  | 'comment_replies'
  | 'hashtag_strategy'
  | 'content_variety'
  | 'bio_link_drives_click'
  | 'voice_consistent';

export type ChecklistScore = 'green' | 'yellow' | 'red' | 'na';

export interface ChecklistItem {
  id: ChecklistItemId;
  title: string;
  description: string;
  score: ChecklistScore;
  note: string;
  overridden: boolean;
}

export interface ScorecardSummary {
  green: number;
  yellow: number;
  red: number;
  na: number;
}

export interface ScorecardSnapshot {
  generated_at: string;
  items: ChecklistItem[];
  summary: ScorecardSummary;
}

interface RuleOutput {
  score: ChecklistScore;
  note: string;
}

type Rule = (a: ProspectAnalysisRow) => RuleOutput;

// ── Rules ───────────────────────────────────────────────────────────────────

const ruleBioOptimized: Rule = (a) => {
  if (!a.bio_assessment) return { score: 'na', note: 'No bio analysis available.' };
  const r = a.bio_assessment.rating;
  if (r === 'good') return { score: 'green', note: a.bio_assessment.note || 'Clear hook + CTA.' };
  if (r === 'okay') return { score: 'yellow', note: a.bio_assessment.note || 'Bio works but could sharpen.' };
  return { score: 'red', note: a.bio_assessment.note || 'Bio needs a clear hook and CTA.' };
};

const ruleProfilePicPro: Rule = (a) => {
  if (!a.profile_pic_assessment) return { score: 'na', note: 'No profile picture analysis.' };
  const r = a.profile_pic_assessment.rating;
  if (r === 'good') return { score: 'green', note: a.profile_pic_assessment.note || 'Professional and readable.' };
  if (r === 'okay') return { score: 'yellow', note: a.profile_pic_assessment.note || 'Could be sharper.' };
  return { score: 'red', note: a.profile_pic_assessment.note || 'Profile picture needs work.' };
};

const ruleCadenceConsistent: Rule = (a) => {
  if (!a.posting_cadence) return { score: 'na', note: 'Cadence unknown.' };
  const { posts_per_week: ppw, trend } = a.posting_cadence;
  if (trend === 'unknown') return { score: 'na', note: 'Not enough post history.' };
  if (ppw >= 3 && trend !== 'declining') {
    return { score: 'green', note: `${ppw.toFixed(1)} posts/week, ${trend}.` };
  }
  if (ppw >= 1.5) {
    return { score: 'yellow', note: `${ppw.toFixed(1)} posts/week — push for 3+.` };
  }
  return { score: 'red', note: `Only ${ppw.toFixed(1)} posts/week.` };
};

const ruleCaptionHooks: Rule = (a) => {
  if (!a.caption_pattern) return { score: 'na', note: 'No caption analysis.' };
  const h = a.caption_pattern.hook_quality_avg;
  if (h >= 0.6) return { score: 'green', note: `Hook strength ${(h * 100).toFixed(0)}/100.` };
  if (h >= 0.4) return { score: 'yellow', note: `Hook strength ${(h * 100).toFixed(0)}/100 — tighten openers.` };
  return { score: 'red', note: `Hook strength ${(h * 100).toFixed(0)}/100 — captions bury the lede.` };
};

const ruleCaptionCtas: Rule = (a) => {
  if (!a.caption_pattern) return { score: 'na', note: 'No caption analysis.' };
  const c = a.caption_pattern.cta_rate;
  if (c >= 0.3) return { score: 'green', note: `${(c * 100).toFixed(0)}% of captions include a CTA.` };
  if (c >= 0.15) return { score: 'yellow', note: `${(c * 100).toFixed(0)}% have CTAs — push toward 30%+.` };
  return { score: 'red', note: `Only ${(c * 100).toFixed(0)}% of captions ask for action.` };
};

const ruleCommentReplies: Rule = (a) => {
  if (!a.comment_signal) return { score: 'na', note: 'No comment data.' };
  const r = a.comment_signal.reply_rate;
  if (r >= 0.2) return { score: 'green', note: `Replies on ${(r * 100).toFixed(0)}% of comments.` };
  if (r >= 0.1) return { score: 'yellow', note: `${(r * 100).toFixed(0)}% reply rate — engage more.` };
  return { score: 'red', note: `${(r * 100).toFixed(0)}% reply rate — leaving engagement on the table.` };
};

const ruleHashtagStrategy: Rule = (a) => {
  const captions = (a.raw_captions ?? []) as unknown[];
  if (captions.length < 5) return { score: 'na', note: 'Not enough captions to evaluate hashtags.' };
  let withHashtags = 0;
  let withMulti = 0;
  for (const c of captions) {
    const text = typeof c === 'string' ? c : '';
    const tags = text.match(/#\w+/g) ?? [];
    if (tags.length >= 1) withHashtags += 1;
    if (tags.length >= 3) withMulti += 1;
  }
  const total = captions.length;
  if (withMulti / total >= 0.5) {
    return { score: 'green', note: `${withMulti}/${total} posts use 3+ hashtags.` };
  }
  if (withHashtags / total >= 0.5) {
    return { score: 'yellow', note: `${withHashtags}/${total} posts include hashtags.` };
  }
  return { score: 'red', note: 'Most captions lack hashtags.' };
};

const ruleContentVariety: Rule = (a) => {
  const captions = (a.raw_captions ?? []) as unknown[];
  if (captions.length < 5) return { score: 'na', note: 'Fewer than 5 posts to analyse.' };
  // Cheap clustering: dedupe by first 4-word phrase. Real clustering will replace this if needed.
  const heads = new Set<string>();
  for (const c of captions) {
    const text = typeof c === 'string' ? c : '';
    heads.add(text.trim().toLowerCase().split(/\s+/).slice(0, 4).join(' '));
  }
  if (heads.size >= 3) return { score: 'green', note: `${heads.size} distinct caption styles.` };
  if (heads.size === 2) return { score: 'yellow', note: 'Two recurring caption shapes — mix more.' };
  return { score: 'red', note: 'Captions feel repetitive.' };
};

const ruleBioLinkDrivesClick: Rule = (a) => {
  if (!a.bio_assessment) return { score: 'na', note: 'No bio analysis.' };
  const cta = a.bio_assessment.cta ?? '';
  if (!cta) return { score: 'red', note: 'Bio has no CTA.' };
  if (/https?:\/\/|\.\w{2,}|@\w+/.test(cta)) {
    return { score: 'green', note: 'CTA points to a destination.' };
  }
  return { score: 'yellow', note: 'CTA exists but no concrete destination.' };
};

const ruleVoiceConsistent: Rule = (a) => {
  if (!a.caption_pattern) return { score: 'na', note: 'No caption analysis.' };
  const note = (a.caption_pattern.voice_note ?? '').toLowerCase();
  if (!note) return { score: 'na', note: 'Voice unanalysed.' };
  if (/inconsistent|mixed|scattered/.test(note)) {
    return { score: 'red', note: a.caption_pattern.voice_note };
  }
  if (/consistent|cohesive|focused|clear/.test(note)) {
    return { score: 'green', note: a.caption_pattern.voice_note };
  }
  return { score: 'yellow', note: a.caption_pattern.voice_note };
};

// ── Catalog ────────────────────────────────────────────────────────────────

interface CatalogEntry {
  id: ChecklistItemId;
  title: string;
  description: string;
  rule: Rule;
}

const CATALOG: CatalogEntry[] = [
  { id: 'bio_optimized', title: 'Bio is optimized', description: 'Clear hook, clear CTA, on-brand voice.', rule: ruleBioOptimized },
  { id: 'profile_pic_pro', title: 'Profile picture is pro', description: 'Readable at thumbnail size, on-brand.', rule: ruleProfilePicPro },
  { id: 'cadence_consistent', title: 'Posting cadence is consistent', description: 'At least 3 posts/week, steady or climbing.', rule: ruleCadenceConsistent },
  { id: 'caption_hooks', title: 'Captions hook in the first line', description: 'Opening line earns the scroll.', rule: ruleCaptionHooks },
  { id: 'caption_ctas', title: 'Captions include a CTA', description: 'Most posts ask the viewer to do something.', rule: ruleCaptionCtas },
  { id: 'comment_replies', title: 'Creator replies to comments', description: 'Engagement is two-way.', rule: ruleCommentReplies },
  { id: 'hashtag_strategy', title: 'Hashtag strategy is intentional', description: '3+ relevant tags per post.', rule: ruleHashtagStrategy },
  { id: 'content_variety', title: 'Content variety is healthy', description: 'Multiple caption styles, not a single template.', rule: ruleContentVariety },
  { id: 'bio_link_drives_click', title: 'Bio link drives a click', description: 'CTA points to a real destination.', rule: ruleBioLinkDrivesClick },
  { id: 'voice_consistent', title: 'Voice is consistent', description: 'Recognisable tone across captions.', rule: ruleVoiceConsistent },
];

interface OverrideValue {
  score?: ChecklistScore;
  note?: string;
}

export function computeScorecard(analysis: ProspectAnalysisRow): ScorecardSnapshot {
  const overrides = (analysis.overrides ?? {}) as { checklist_overrides?: { items?: Record<string, OverrideValue> } };
  const overrideItems = overrides.checklist_overrides?.items ?? {};

  const items: ChecklistItem[] = CATALOG.map((entry) => {
    const ruleOut = entry.rule(analysis);
    const ov = overrideItems[entry.id];
    if (ov && (ov.score !== undefined || ov.note !== undefined)) {
      return {
        id: entry.id,
        title: entry.title,
        description: entry.description,
        score: ov.score ?? ruleOut.score,
        note: ov.note ?? ruleOut.note,
        overridden: true,
      };
    }
    return {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      score: ruleOut.score,
      note: ruleOut.note,
      overridden: false,
    };
  });

  const summary: ScorecardSummary = { green: 0, yellow: 0, red: 0, na: 0 };
  for (const item of items) summary[item.score] += 1;

  return {
    generated_at: new Date().toISOString(),
    items,
    summary,
  };
}

export const CHECKLIST_CATALOG = CATALOG;
