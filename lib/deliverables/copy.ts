/**
 * Client-facing copy for deliverable types.
 *
 * Per the directional pivot doc (`memory/project_credits_directional_pivot.md`):
 * internal accounting language stays "credits"; external/client surfaces speak
 * "deliverables / production capacity / monthly output." This module is the
 * single source of truth for the external phrasing, display names,
 * singular/plural, low-balance / overdraft framing, keyed off slug so adding
 * a new type is a single object literal entry.
 *
 * Anything a client reads must come from here. If you find yourself
 * hardcoding "edited videos" in JSX, route it through `deliverableCopy`
 * instead.
 */

import type { DeliverableTypeSlug } from '@/lib/credits/types';

export interface DeliverableCopy {
  /** Singular noun, sentence case. e.g. "edited video" */
  singular: string;
  /** Plural noun, sentence case. e.g. "edited videos" */
  plural: string;
  /**
   * Short label for badges / pills / sidebar entries. Often the same as
   * `singular` but allowed to drop articles. e.g. "Edited video"
   */
  shortLabel: string;
  /**
   * Verb form for "this charges N <verb>", the noun the consume action is
   * deducting from. Almost always the same as `plural` but exposed so
   * future types ("retainer hours", "ad impressions") can deviate.
   */
  unitNoun: string;
  /**
   * Sentence used as the threshold email subject line and the pipeline
   * banner headline when balance hits 0. Receives the count via {{count}}.
   */
  outOfHeadline: string;
  /**
   * Description shown beneath the type's balance card on the client
   * deliverables page. One sentence, sentence case, ends with a period.
   */
  description: string;
}

const COPY: Record<DeliverableTypeSlug, DeliverableCopy> = {
  edited_video: {
    singular: 'edited video',
    plural: 'edited videos',
    shortLabel: 'Edited video',
    unitNoun: 'edited videos',
    outOfHeadline: 'You\'re out of edited videos this month.',
    description: 'Short-form vertical edits delivered through the production pipeline.',
  },
  ugc_video: {
    singular: 'UGC-style video',
    plural: 'UGC-style videos',
    shortLabel: 'UGC video',
    unitNoun: 'UGC-style videos',
    outOfHeadline: 'You\'re out of UGC-style videos this month.',
    description: 'Creator-led short videos shot on phone, delivered ready to post.',
  },
  static_graphic: {
    singular: 'static graphic',
    plural: 'static graphics',
    shortLabel: 'Static graphic',
    unitNoun: 'static graphics',
    outOfHeadline: 'You\'re out of static graphics this month.',
    description: 'Single-frame social posts, designed in batches for the month.',
  },
};

export function deliverableCopy(slug: DeliverableTypeSlug): DeliverableCopy {
  return COPY[slug];
}

/**
 * Pluralise a count against a slug. `pluralise('edited_video', 1)` →
 * `"1 edited video"`, `pluralise('edited_video', 3)` → `"3 edited videos"`.
 * Use for inline counts in copy ("3 edited videos remaining").
 */
export function pluraliseDeliverable(slug: DeliverableTypeSlug, count: number): string {
  const c = deliverableCopy(slug);
  return `${count} ${count === 1 ? c.singular : c.plural}`;
}
