import Stripe from 'stripe';

// TODO(dual-stripe): this module assumes a single Stripe account (AC). When
// Nativz moves to its own Stripe account, this needs refactoring:
//   - stripe_* tables: add stripe_account_id column, composite PK (account, id)
//   - webhook route: /api/webhooks/stripe/[agency] with per-agency secret lookup
//   - getStripe(agency) with per-agency getSecret(`STRIPE_SECRET_KEY_${agency}`)
// See docs/superpowers/specs/2026-04-24-revenue-hardening-design.md §2.6.
type StripeCtorConfig = ConstructorParameters<typeof Stripe>[1];

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Add it to .env.local (or Vercel env) before calling Stripe.',
    );
  }
  const config: StripeCtorConfig = {
    appInfo: { name: 'Nativz Cortex Revenue Hub', version: '0.1.0' },
    maxNetworkRetries: 2,
    timeout: 15_000,
  };
  cached = new Stripe(key, config);
  return cached;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set.');
  return secret;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
