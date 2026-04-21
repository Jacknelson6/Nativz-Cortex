import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const patchSchema = z
  .object({
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    headline: z.string().min(1).max(500).optional(),
    body_copy: z.string().max(4000).nullable().optional(),
    visual_description: z.string().max(4000).nullable().optional(),
    image_prompt: z.string().min(1).max(4000).optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await assertAdmin();
  if ('error' in admin) return admin.error;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await admin.client
    .from('ad_concepts')
    .update(parsed.data)
    .eq('id', id)
    .select(
      'id, slug, template_name, template_id, headline, body_copy, visual_description, source_grounding, image_prompt, image_storage_path, status, position, notes, created_at, updated_at',
    )
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ concept: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await assertAdmin();
  if ('error' in admin) return admin.error;

  const { id } = await params;
  const { data: row } = await admin.client
    .from('ad_concepts')
    .select('image_storage_path')
    .eq('id', id)
    .maybeSingle();

  if (row?.image_storage_path) {
    await admin.client.storage.from('ad-creatives').remove([row.image_storage_path]);
  }

  const { error } = await admin.client.from('ad_concepts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function assertAdmin(): Promise<
  | { client: ReturnType<typeof createAdminClient> }
  | { error: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const client = createAdminClient();
  const { data: me } = await client
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin =
    me?.is_super_admin === true ||
    me?.role === 'admin' ||
    me?.role === 'super_admin';
  if (!isAdmin) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { client };
}
