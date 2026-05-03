/**
 * Add-on SKU catalog.
 *
 * Replaces the old 5/10/25 "credit pack" abstraction. Phase B's directional
 * doc reframes top-ups as **named deliverables** ("Extra Edited Video") plus
 * one SLA modifier ("Rush Delivery upgrade"), priced and named the same way
 * the agency talks about them on a sales call.
 *
 * Shape:
 *   - `slug`: stable identifier used in URLs + Stripe metadata
 *   - `deliverable_type_slug`: which balance bucket gets credited (or null
 *     for SLA modifiers that don't add deliverables)
 *   - `quantity`: how many of that deliverable the SKU adds (Rush adds 0)
 *   - `price_cents`: display price; the source of truth is still the Stripe
 *     price object, this is purely for the UI
 *   - `env_key`: suffix appended after the agency prefix to read the Stripe
 *     price id (e.g. `NATIVZ_${env_key}` → `NATIVZ_STRIPE_PRICE_ADDON_EDITED_VIDEO`)
 *
 * Adding a new SKU: append a new entry below + add the matching
 * `<AGENCY>_${env_key}` env var. No code changes required in the checkout
 * route or webhook, the addon-slug is the routing key.
 */

import type { AgencyBrand } from '@/lib/agency/detect';
import type { DeliverableTypeSlug } from '@/lib/credits/types';

export type AddonSlug = 'extra_edited_video' | 'extra_ugc_video' | 'rush_upgrade';

export interface AddonSku {
  slug: AddonSlug;
  label: string;
  description: string;
  /**
   * Type bucket to credit on successful purchase. `null` for SLA modifiers
   * (Rush) that don't add deliverables, they get recorded as a `grant_topup`
   * with delta=0 plus a flag set on the linked deliverable in Phase D.
   */
  deliverable_type_slug: DeliverableTypeSlug | null;
  /** Units added to the balance on purchase. Rush is 0 (modifier, not unit). */
  quantity: number;
  /** Display-only. Source of truth is the Stripe price object. */
  price_cents: number;
  /** Suffix after `<AGENCY>_` to look up the Stripe price id. */
  env_key:
    | 'STRIPE_PRICE_ADDON_EDITED_VIDEO'
    | 'STRIPE_PRICE_ADDON_UGC_VIDEO'
    | 'STRIPE_PRICE_ADDON_RUSH_UPGRADE';
  /**
   * One-line subtitle used on the AddOnSection card. Sentence case, no
   * trailing period, the layout supplies its own punctuation.
   */
  card_subtitle: string;
}

export const ADDON_SKUS: Record<AddonSlug, AddonSku> = {
  extra_edited_video: {
    slug: 'extra_edited_video',
    label: 'Extra Edited Video',
    description:
      'One additional edited short-form video, vertical, captions and music included. Ad-hoc beyond your monthly allotment.',
    deliverable_type_slug: 'edited_video',
    quantity: 1,
    price_cents: 15000,
    env_key: 'STRIPE_PRICE_ADDON_EDITED_VIDEO',
    card_subtitle: 'Ad-hoc, beyond this month’s allotment',
  },
  extra_ugc_video: {
    slug: 'extra_ugc_video',
    label: 'UGC-Style Video',
    description:
      'One additional creator-style short, shot on phone and delivered ready to post. Goes outside your standard UGC cadence.',
    deliverable_type_slug: 'ugc_video',
    quantity: 1,
    price_cents: 20000,
    env_key: 'STRIPE_PRICE_ADDON_UGC_VIDEO',
    card_subtitle: 'One extra creator-led video',
  },
  rush_upgrade: {
    slug: 'rush_upgrade',
    label: 'Rush Delivery',
    description:
      'Move one in-flight deliverable to a 48-hour turnaround. Surcharge per asset, no deliverables added to your balance.',
    // Modifier: doesn't add to any balance bucket. Phase D wires the SLA flag
    // onto the linked deliverable; Phase B records the purchase and emails
    // the receipt only.
    deliverable_type_slug: null,
    quantity: 0,
    price_cents: 14900,
    env_key: 'STRIPE_PRICE_ADDON_RUSH_UPGRADE',
    card_subtitle: 'Bump one asset to 48-hour turnaround',
  },
};

export const ADDON_ORDER: AddonSlug[] = [
  'extra_edited_video',
  'extra_ugc_video',
  'rush_upgrade',
];

export function isAddonSlug(value: unknown): value is AddonSlug {
  return typeof value === 'string' && value in ADDON_SKUS;
}

/**
 * Resolve the Stripe price id for an add-on on a given agency. Returns null
 * when the env var isn't configured for that agency, checkout surfaces a
 * 503 instead of a 500 in that case.
 */
export function resolveAddonPriceId(
  agency: AgencyBrand,
  slug: AddonSlug,
): string | null {
  const sku = ADDON_SKUS[slug];
  const prefix = agency === 'anderson' ? 'ANDERSON_' : 'NATIVZ_';
  const direct = process.env[`${prefix}${sku.env_key}`];
  if (direct && direct.trim().length > 0) return direct.trim();
  // Nativz reads a non-prefixed legacy var as a final fallback so single-
  // tenant deploys can ship with un-prefixed env names.
  if (agency === 'nativz') {
    const legacy = process.env[sku.env_key];
    if (legacy && legacy.trim().length > 0) return legacy.trim();
  }
  return null;
}

export function listConfiguredAddons(agency: AgencyBrand): AddonSku[] {
  return ADDON_ORDER.map((slug) => ADDON_SKUS[slug]).filter((sku) =>
    Boolean(resolveAddonPriceId(agency, sku.slug)),
  );
}
