import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * /api/calendar/review/contacts/[id]
 *
 *   PATCH  → toggle notifications, change cadence, edit name/role
 *   DELETE → remove the contact (admin or brand viewer with access)
 *
 * Both check the contact's `client_id` against the caller's access set
 * before mutating, so a viewer can't edit another brand's POC list by
 * guessing an id.
 */

const UpdateSchema = z
  .object({
    name: z.string().trim().max(120).nullable().optional(),
    role: z.string().trim().max(80).nullable().optional(),
    notifications_enabled: z.boolean().optional(),
    followup_cadence: z
      .enum(['off', 'daily', 'every_3_days', 'weekly', 'biweekly'])
      .optional(),
  })
  .strict();

async function userMayTouch(
  userId: string,
  contactClientId: string,
): Promise<boolean> {
  if (await isAdmin(userId)) return true;
  const admin = createAdminClient();
  const { data } = await admin
    .from('user_client_access')
    .select('client_id')
    .eq('user_id', userId)
    .eq('client_id', contactClientId)
    .maybeSingle();
  return !!data;
}

async function loadContact(id: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('content_drop_review_contacts')
    .select('id, client_id')
    .eq('id', id)
    .maybeSingle();
  return data;
}

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

  const contact = await loadContact(id);
  if (!contact) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!(await userMayTouch(user.id, contact.client_id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('content_drop_review_contacts')
    .update(parsed.data)
    .eq('id', id)
    .select(
      'id, client_id, email, name, role, notifications_enabled, followup_cadence, created_at, updated_at',
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const contact = await loadContact(id);
  if (!contact) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!(await userMayTouch(user.id, contact.client_id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('content_drop_review_contacts')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
