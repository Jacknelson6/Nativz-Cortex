// SPY-07 T06: POST /api/prospects/[id]/convert — sales-rep click that
// promotes a prospect into a client. Delegates the multi-table dance to
// lib/prospects/convert.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/require-admin';
import { convertProspect, ConvertProspectError } from '@/lib/prospects/convert';

export const maxDuration = 60;

const BodySchema = z.object({
  org_name: z.string().trim().min(2).max(120),
  contact_email: z.string().email(),
  contact_name: z.string().trim().min(2).max(120),
  tier: z.string().min(1),
  strategist_user_id: z.string().uuid(),
  notes: z.string().max(2000).optional(),
  merge_into_org_id: z.string().uuid().optional(),
});

async function handlePost(request: NextRequest, prospectId: string) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const raw = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const result = await convertProspect({
      prospectId,
      actorUserId: auth.userId,
      body: parsed.data,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ConvertProspectError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('POST /api/prospects/[id]/convert error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handlePost(request, id);
}
