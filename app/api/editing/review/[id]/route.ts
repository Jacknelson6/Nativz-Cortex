import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/editing/review/[id]
 *
 * Edit per-share-link metadata exposed in the editing-project review
 * surface. Mirrors /api/calendar/review/[id]: admin-only, currently
 * only `name` is mutable. Empty string clears back to the derived
 * "<client> - <project>" header.
 */

const PatchSchema = z
  .object({
    name: z.string().trim().max(120).nullable().optional(),
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
  if ('name' in parsed.data) {
    update.name =
      parsed.data.name && parsed.data.name.length > 0 ? parsed.data.name : null;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from('editing_project_share_links')
    .update(update)
    .eq('id', id)
    .select('id, name')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ link: row });
}
