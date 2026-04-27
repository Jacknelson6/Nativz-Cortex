import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scheduleDrop } from '@/lib/calendar/schedule-drop';

export const maxDuration = 300;

const BodySchema = z.object({
  includedVideoIds: z.array(z.string().uuid()).optional(),
  overrides: z.record(z.string(), z.string()).optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: z.infer<typeof BodySchema> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    body = BodySchema.parse(raw ?? {});
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid body';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    const result = await scheduleDrop(admin, {
      dropId: id,
      includedVideoIds: body.includedVideoIds,
      overrides: body.overrides,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'schedule failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
