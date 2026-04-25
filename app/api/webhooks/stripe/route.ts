import { NextRequest } from 'next/server';
import { handleStripeWebhook } from '@/lib/stripe/webhook-handler';

// Legacy single-account endpoint. Tries every configured agency's webhook
// secret until one verifies — so a Stripe Dashboard pointing here serves
// either Nativz or AC seamlessly. New agency accounts can point here OR
// at the per-agency endpoint `/api/webhooks/stripe/[agency]`.

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return handleStripeWebhook(req, 'auto');
}
