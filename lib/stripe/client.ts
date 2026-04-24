import Stripe from 'stripe';
import type { AgencyBrand } from '@/lib/agency/detect';

// Per-agency Stripe accounts. Each agency has its own Stripe account with its
// own secret + webhook secret. Legacy single-account env vars (STRIPE_SECRET_KEY,
// STRIPE_WEBHOOK_SECRET) still work as the Nativz default to avoid a breaking
// rollout — the per-agency keys take precedence when present.
//
// Env vars:
//   NATIVZ_STRIPE_SECRET_KEY         (preferred; falls back to STRIPE_SECRET_KEY)
//   NATIVZ_STRIPE_WEBHOOK_SECRET     (preferred; falls back to STRIPE_WEBHOOK_SECRET)
//   ANDERSON_STRIPE_SECRET_KEY       (required for AC billing)
//   ANDERSON_STRIPE_WEBHOOK_SECRET   (required for AC webhook verification)
//   STRIPE_SECRET_KEY                (legacy single-account fallback → Nativz)
//   STRIPE_WEBHOOK_SECRET            (legacy single-account fallback → Nativz)

type StripeCtorConfig = ConstructorParameters<typeof Stripe>[1];

const cache: Partial<Record<AgencyBrand, Stripe>> = {};

function resolveSecretKey(agency: AgencyBrand): string {
  if (agency === 'anderson') {
    const ac = process.env.ANDERSON_STRIPE_SECRET_KEY;
    if (!ac) {
      throw new Error(
        'ANDERSON_STRIPE_SECRET_KEY is not set. Add it to .env.local (or Vercel env) before calling Stripe for Anderson Collaborative.',
      );
    }
    return ac;
  }
  const nativz = process.env.NATIVZ_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  if (!nativz) {
    throw new Error(
      'NATIVZ_STRIPE_SECRET_KEY (or legacy STRIPE_SECRET_KEY) is not set. Add one to .env.local before calling Stripe for Nativz.',
    );
  }
  return nativz;
}

/**
 * Get the Stripe client for a specific agency. Cached per-agency.
 *
 * Callers that don't know the agency up-front (e.g. legacy code paths) can
 * omit the arg and default to Nativz. New code should always pass the agency.
 */
export function getStripe(agency: AgencyBrand = 'nativz'): Stripe {
  const existing = cache[agency];
  if (existing) return existing;
  const key = resolveSecretKey(agency);
  const config: StripeCtorConfig = {
    appInfo: { name: `Nativz Cortex Revenue Hub (${agency})`, version: '0.2.0' },
    maxNetworkRetries: 2,
    timeout: 15_000,
  };
  const client = new Stripe(key, config);
  cache[agency] = client;
  return client;
}

export function getStripeWebhookSecret(agency: AgencyBrand = 'nativz'): string {
  if (agency === 'anderson') {
    const ac = process.env.ANDERSON_STRIPE_WEBHOOK_SECRET;
    if (!ac) {
      throw new Error('ANDERSON_STRIPE_WEBHOOK_SECRET is not set.');
    }
    return ac;
  }
  const nativz = process.env.NATIVZ_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  if (!nativz) {
    throw new Error('NATIVZ_STRIPE_WEBHOOK_SECRET (or legacy STRIPE_WEBHOOK_SECRET) is not set.');
  }
  return nativz;
}

export function isStripeConfigured(agency: AgencyBrand = 'nativz'): boolean {
  if (agency === 'anderson') return Boolean(process.env.ANDERSON_STRIPE_SECRET_KEY);
  return Boolean(process.env.NATIVZ_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY);
}

/**
 * Iterate through all configured agencies — used by the backfill script and
 * cron reconciler to run the same logic against each Stripe account.
 */
export function configuredAgencies(): AgencyBrand[] {
  const agencies: AgencyBrand[] = [];
  if (isStripeConfigured('nativz')) agencies.push('nativz');
  if (isStripeConfigured('anderson')) agencies.push('anderson');
  return agencies;
}
