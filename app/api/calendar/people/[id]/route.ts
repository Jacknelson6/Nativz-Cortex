import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .maybeSingle();
  return me?.role === 'admin' || me?.is_super_admin === true;
}

const patchSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  priorityTier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  emails: z.array(z.string().trim().toLowerCase().email()).min(1).max(8).optional(),
});

/**
 * PATCH /api/calendar/people/[id]
 *
 * Update one person's attributes and optionally replace their email aliases.
 * Email replacement is atomic: we delete the existing rows then insert the new
 * set inside a best-effort sequence — if the insert fails we re-insert the old
 * list so we don't strand a person with no emails.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const updates: Record<string, unknown> = {};
  if (parsed.data.displayName !== undefined) updates.display_name = parsed.data.displayName;
  if (parsed.data.color !== undefined) updates.color = parsed.data.color;
  if (parsed.data.priorityTier !== undefined) updates.priority_tier = parsed.data.priorityTier;
  if (parsed.data.sortOrder !== undefined) updates.sort_order = parsed.data.sortOrder;
  if (parsed.data.isActive !== undefined) updates.is_active = parsed.data.isActive;

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await admin
      .from('scheduling_people')
      .update(updates)
      .eq('id', id);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  }

  if (parsed.data.emails) {
    const { data: existing } = await admin
      .from('scheduling_person_emails')
      .select('email')
      .eq('person_id', id);
    const previousEmails = (existing ?? []).map((r) => r.email as string);

    const { error: deleteErr } = await admin
      .from('scheduling_person_emails')
      .delete()
      .eq('person_id', id);
    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    const { error: insertErr } = await admin
      .from('scheduling_person_emails')
      .insert(parsed.data.emails.map((email) => ({ person_id: id, email })));

    if (insertErr) {
      // Restore previous emails so we don't leave the person stranded
      if (previousEmails.length > 0) {
        await admin
          .from('scheduling_person_emails')
          .insert(previousEmails.map((email) => ({ person_id: id, email })));
      }
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/calendar/people/[id]
 *
 * Soft-delete: flips is_active=false instead of removing the row, so any
 * historical scheduling links (event members, etc.) keep their FK target.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { error } = await admin
    .from('scheduling_people')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
