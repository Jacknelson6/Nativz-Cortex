/**
 * Top-up pack configuration.
 *
 * Three pack sizes (5 / 10 / 25). Each pack has a Stripe price id per agency.
 * Env layout:
 *
 *   NATIVZ_STRIPE_CREDITS_PRICE_5    NATIVZ_STRIPE_CREDITS_PRICE_10    NATIVZ_STRIPE_CREDITS_PRICE_25
 *   ANDERSON_STRIPE_CREDITS_PRICE_5  ANDERSON_STRIPE_CREDITS_PRICE_10  ANDERSON_STRIPE_CREDITS_PRICE_25
 *
 * Legacy fallback (`STRIPE_CREDITS_PRICE_<N>`) maps to the Nativz account so
 * a single-agency deployment doesn't need the prefixed name.
 *
 * The `unitPriceCents` value is recorded into the Checkout session metadata
 * so the refund webhook can compute "how many credits does this refund take
 * back" without re-reading the price object from Stripe.
 */

import type { AgencyBrand } from '@/lib/agency/detect';

export const PACK_SIZES = [5, 10, 25] as const;
export type PackSize = (typeof PACK_SIZES)[number];

export interface PackConfig {
  size: PackSize;
  priceId: string;
}

export function isPackSize(value: unknown): value is PackSize {
  return typeof value === 'number' && (PACK_SIZES as readonly number[]).includes(value);
}

function envForPack(agency: AgencyBrand, size: PackSize): string | undefined {
  const prefix = agency === 'anderson' ? 'ANDERSON_STRIPE_CREDITS_PRICE_' : 'NATIVZ_STRIPE_CREDITS_PRICE_';
  const key = `${prefix}${size}`;
  const direct = process.env[key];
  if (direct) return direct;
  // Nativz legacy alias
  if (agency === 'nativz') return process.env[`STRIPE_CREDITS_PRICE_${size}`];
  return undefined;
}

/**
 * Resolve the Stripe price id for a pack on the given agency. Returns null
 * when the env var is not configured — callers surface a 503-style error
 * ("top-ups not yet enabled") rather than 500-ing.
 */
export function resolvePackPriceId(agency: AgencyBrand, size: PackSize): string | null {
  const v = envForPack(agency, size);
  return v && v.trim().length > 0 ? v.trim() : null;
}

export function listConfiguredPacks(agency: AgencyBrand): PackConfig[] {
  const out: PackConfig[] = [];
  for (const size of PACK_SIZES) {
    const priceId = resolvePackPriceId(agency, size);
    if (priceId) out.push({ size, priceId });
  }
  return out;
}
