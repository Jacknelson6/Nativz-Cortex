import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/calendar/review/[id]
 *
 * Edit per-share-link metadata exposed in the review surface — the
 * project name, project type, and abandoned flag. Admin-only on
 * purpose: viewers can read these fields but shouldn't be renaming
 * the agency's projects from the client portal.
 */

const PatchSchema = z
  .object({
    name: z.string().trim().max(120).nullable().optional(),
    project_type: z
      .enum(['social_ads', 'ctv_ads', 'organic_content', 'other'])
      .nullable()
      .optional(),
    project_type_other: z.string().trim().max(60).nullable().optional(),
    abandoned: z.boolean().optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {};
  const data = parsed.data;
  if ('name' in data) {
    // Empty string clears back to null (reverts to derived name).
    update.name = data.name && data.name.length > 0 ? data.name : null;
  }
  if ('project_type' in data) {
    update.project_type = data.project_type ?? null;
    if (data.project_type !== 'other') {
      // Drop the freeform label when the type isn't "other" anymore.
      update.project_type_other = null;
    }
  }
  if ('project_type_other' in data) {
    update.project_type_other =
      data.project_type_other && data.project_type_other.length > 0
        ? data.project_type_other
        : null;
  }
  if ('abandoned' in data) {
    update.abandoned_at = data.abandoned ? new Date().toISOString() : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from('content_drop_share_links')
    .update(update)
    .eq('id', id)
    .select(
      'id, name, project_type, project_type_other, abandoned_at',
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ link: row });
}
