// SPY-01 T11: POST /api/prospects/[id]/touchpoints
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/prospects/auth';

export const dynamic = 'force-dynamic';

const TouchpointKindEnum = z.enum([
  'note',
  'email_sent',
  'email_received',
  'meeting',
  'demo',
  'loom',
  'dm',
  'phone',
  'state_change',
]);

const BodySchema = z.object({
  kind: TouchpointKindEnum,
  body: z.string().max(4000).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  occurred_at: z.string().datetime().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { admin, userId } = auth;
  const { id } = await params;

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  // Ensure prospect exists (avoid orphaned touchpoints via admin client).
  const { data: prospect } = await admin
    .from('prospects')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!prospect) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: inserted, error } = await admin
    .from('prospect_touchpoints')
    .insert({
      prospect_id: id,
      kind: parsed.data.kind,
      body: parsed.data.body ?? null,
      metadata: parsed.data.metadata ?? {},
      occurred_at: parsed.data.occurred_at ?? new Date().toISOString(),
      created_by: userId,
    })
    .select('*')
    .single();
  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }
  return NextResponse.json({ touchpoint: inserted });
}
