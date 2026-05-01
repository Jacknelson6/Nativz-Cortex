import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scheduleDrop } from '@/lib/calendar/schedule-drop';

export const maxDuration = 300;

const PlatformSchema = z.enum(['instagram', 'tiktok', 'facebook', 'youtube', 'linkedin']);

const BodySchema = z.object({
  includedVideoIds: z.array(z.string().uuid()).optional(),
  overrides: z.record(z.string(), z.string()).optional(),
  platforms: z.array(PlatformSchema).optional(),
  // Defaults to true: posts are inserted as 'draft' and require a share-link
  // approval comment before they're handed to Zernio. The admin "Schedule"
  // button always wants this — bypassing it shipped unapproved Weston Funding
  // and Skibell content into the publish queue. Direct (non-draft) scheduling
  // is reserved for the script-driven `runCalendarPipeline` callers.
  draftMode: z.boolean().optional().default(true),
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

  let body: z.infer<typeof BodySchema>;
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
      platforms: body.platforms,
      draftMode: body.draftMode,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'schedule failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
