// VFF-06 T06: PATCH /api/admin/formats/taxonomy/[id]
// super_admin only; update display_name / description / aliases /
// archived flag / example_video_id on a single viral_formats row.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const PatchSchema = z
  .object({
    display_name: z.string().min(1).max(60).optional(),
    description: z.string().max(280).nullable().optional(),
    aliases: z.array(z.string().min(1).max(40)).max(8).optional(),
    archived: z.boolean().optional(),
    example_video_id: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty patch' });

type Role = { role: string; is_super_admin: boolean | null };

async function requireSuperAdmin(): Promise<
  | { kind: 'ok' }
  | { kind: 'err'; res: ReturnType<typeof NextResponse.json> }
> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { kind: 'err', res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single<Role>();
  const isSuper = me?.role === 'super_admin' || me?.is_super_admin === true;
  if (!isSuper) {
    return { kind: 'err', res: NextResponse.json({ error: 'super_admin required' }, { status: 403 }) };
  }
  return { kind: 'ok' };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSuperAdmin();
  if (auth.kind === 'err') return auth.res;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.display_name !== undefined) patch.display_name = parsed.data.display_name;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.aliases !== undefined) patch.aliases = parsed.data.aliases;
  if (parsed.data.example_video_id !== undefined) patch.example_video_id = parsed.data.example_video_id;
  if (parsed.data.archived !== undefined) {
    patch.archived_at = parsed.data.archived ? new Date().toISOString() : null;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('viral_formats')
    .update(patch)
    .eq('id', id)
    .select(
      'id, kind, slug, display_name, description, aliases, is_seeded, archived_at, example_video_id',
    )
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'not found' },
      { status: error ? 500 : 404 },
    );
  }

  const { count } = await admin
    .from('viral_video_formats')
    .select('video_id', { count: 'exact', head: true })
    .eq('format_id', id);

  return NextResponse.json({ ...data, video_count: count ?? 0 });
}
