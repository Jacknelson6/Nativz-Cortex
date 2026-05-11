// VFF-02: GET + PATCH /api/admin/clients/[id]/format-context
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getBrandFormatSeeds,
  upsertBrandFormatContext,
} from '@/lib/analytics/brand-format-context';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['admin', 'super_admin'];

async function requireAdmin(): Promise<
  | { ok: true; userId: string; admin: ReturnType<typeof createAdminClient> }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const allowed =
    me &&
    (ADMIN_ROLES.includes((me as { role: string }).role) ||
      (me as { is_super_admin?: boolean }).is_super_admin);
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { ok: true, userId: user.id, admin };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data: client } = await auth.admin
    .from('clients')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const context = await getBrandFormatSeeds(id);
  return NextResponse.json({ context });
}

const PatchSchema = z.object({
  seed_terms: z.array(z.string().min(1).max(60)).max(25).optional(),
  excluded_terms: z.array(z.string().min(1).max(60)).max(25).optional(),
  reference_creator_handles: z
    .object({
      tiktok: z.array(z.string().min(1).max(60)).max(20).optional(),
      instagram: z.array(z.string().min(1).max(60)).max(20).optional(),
      youtube: z.array(z.string().min(1).max(60)).max(20).optional(),
    })
    .partial()
    .optional(),
  tone_descriptors: z.array(z.string().min(1).max(60)).max(15).optional(),
  pillar_weights: z.record(z.string(), z.number().min(0).max(1)).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data: client } = await auth.admin
    .from('clients')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const ctx = await upsertBrandFormatContext({
    client_id: id,
    ...parsed.data,
    source: 'manual',
  });
  if (!ctx) {
    return NextResponse.json({ error: 'Upsert failed' }, { status: 500 });
  }
  const warning = ctx.seed_embedding ? null : 'Embedding skipped (Gemini key missing or failed).';
  return NextResponse.json({ context: ctx, warning });
}
