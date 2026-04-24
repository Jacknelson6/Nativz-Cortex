import Stripe from 'stripe';

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
