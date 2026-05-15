// SPY-02 T07: POST /api/prospects/onboard
//
// The sales-call fast path. Accepts a URL, runs classifier + detector,
// inserts (or returns existing) prospect, and responds within the 30s
// product ceiling. Heavy SPY-03 analysis kicks off downstream from the
// confirm-socials route — never from here.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/prospects/auth';
import { onboardFromUrl } from '@/lib/prospects/onboard-from-url';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const RequestSchema = z.object({
  url: z.string().url().max(2048),
  brand_name_hint: z.string().min(1).max(200).optional(),
  // Required: agency tag carried from the QuickOnboardForm UI. Persisted
  // on the prospect row and forwarded into clients.agency on conversion.
  // Hardened post-Victory incident where an untagged prospect converted
  // into a client that silently defaulted to Nativz branding.
  agency: z.enum(['Nativz', 'Anderson Collaborative'], {
    message: 'agency must be "Nativz" or "Anderson Collaborative"',
  }),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await onboardFromUrl({
    url: parsed.data.url,
    createdBy: auth.userId,
    brandNameHint: parsed.data.brand_name_hint ?? null,
    agency: parsed.data.agency,
  });

  if ('error' in result) {
    if (result.error.kind === 'classification_failed' || result.error.kind === 'invalid_url') {
      return NextResponse.json({ error: result.error.message }, { status: 422 });
    }
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json(result);
}
