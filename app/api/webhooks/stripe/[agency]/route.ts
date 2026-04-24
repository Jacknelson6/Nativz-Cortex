import { NextRequest, NextResponse } from 'next/server';
import { handleStripeWebhook } from '@/lib/stripe/webhook-handler';
import type { AgencyBrand } from '@/lib/agency/detect';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const AGENCY_VALUES = new Set<AgencyBrand>(['nativz', 'anderson']);

export async function POST(req: NextRequest, ctx: { params: Promise<{ agency: string }> }) {
  const { agency } = await ctx.params;
  if (!AGENCY_VALUES.has(agency as AgencyBrand)) {
    return NextResponse.json(
      { error: `Unknown agency '${agency}'. Valid values: ${Array.from(AGENCY_VALUES).join(', ')}.` },
      { status: 404 },
    );
  }
  return handleStripeWebhook(req, agency as AgencyBrand);
}
