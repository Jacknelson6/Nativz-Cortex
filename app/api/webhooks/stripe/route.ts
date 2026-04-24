import { NextRequest } from 'next/server';
import { handleStripeWebhook } from '@/lib/stripe/webhook-handler';

// Legacy single-account endpoint. Maps to the Nativz agency so existing
// Stripe Dashboard webhooks pointing here keep working during the rollout
// to per-agency endpoints. New agency accounts should use
// `/api/webhooks/stripe/[agency]` instead.

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return handleStripeWebhook(req, 'nativz');
}
