// VFF-06 T05: GET + POST /api/admin/formats/taxonomy
// GET: list all slugs grouped by kind with video_count.
// POST: super_admin only; create a new slug.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const KIND_VALUES = ['hook_type', 'structure', 'archetype', 'pacing'] as const;
const KindSchema = z.enum(KIND_VALUES);

const QuerySchema = z.object({
  include_archived: z.coerce.boolean().default(false),
  kind: KindSchema.optional(),
});

const CreateSchema = z.object({
  kind: KindSchema,
  slug: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  display_name: z.string().min(1).max(60),
  description: z.string().max(280).optional(),
  aliases: z.array(z.string().min(1).max(40)).max(8).default([]),
});

type Role = { role: string; is_super_admin: boolean | null };

async function getRoleOrUnauthorized(): Promise<
  | { kind: 'ok'; user_id: string; isAdmin: boolean; isSuper: boolean }
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
  const isAdmin = isSuper || me?.role === 'admin';
  if (!isAdmin) {
    return { kind: 'err', res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { kind: 'ok', user_id: user.id, isAdmin, isSuper };
}

export async function GET(req: Request) {
  const auth = await getRoleOrUnauthorized();
  if (auth.kind === 'err') return auth.res;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }

  const admin = createAdminClient();
  let q = admin
    .from('viral_formats')
    .select(
      'id, kind, slug, display_name, description, aliases, is_seeded, archived_at, example_video_id',
    )
    .order('kind', { ascending: true })
    .order('display_name', { ascending: true });
  if (parsed.data.kind) q = q.eq('kind', parsed.data.kind);
  if (!parsed.data.include_archived) q = q.is('archived_at', null);

  const { data: formats, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Compute video_count per format via a single grouped query.
  const { data: counts } = await admin
    .from('viral_video_formats')
    .select('format_id');
  const lookup = new Map<string, number>();
  for (const row of (counts ?? []) as { format_id: string }[]) {
    lookup.set(row.format_id, (lookup.get(row.format_id) ?? 0) + 1);
  }

  const enriched = (formats ?? []).map((f) => ({
    ...f,
    video_count: lookup.get((f as { id: string }).id) ?? 0,
  }));
  return NextResponse.json({ formats: enriched });
}

export async function POST(req: Request) {
  const auth = await getRoleOrUnauthorized();
  if (auth.kind === 'err') return auth.res;
  if (!auth.isSuper) {
    return NextResponse.json({ error: 'super_admin required' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { kind, slug, display_name, description, aliases } = parsed.data;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('viral_formats')
    .select('id')
    .eq('kind', kind)
    .eq('slug', slug)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'duplicate slug for kind' }, { status: 409 });
  }

  const { data, error } = await admin
    .from('viral_formats')
    .insert({
      kind,
      slug,
      display_name,
      description: description ?? null,
      aliases,
      is_seeded: false,
    })
    .select(
      'id, kind, slug, display_name, description, aliases, is_seeded, archived_at, example_video_id',
    )
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 });
  }
  return NextResponse.json({ ...data, video_count: 0 });
}
