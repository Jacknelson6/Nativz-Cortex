import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { persistRecomputedDraft, type ServiceLine } from '@/lib/proposals/draft-engine';

const AddLineBody = z.object({
  // Catalog-backed line: pass a service_id (uuid) OR service_slug.
  service_id: z.string().uuid().optional(),
  service_slug: z.string().optional(),
  // Free-form line: pass name + unit_price_cents + billing_unit. service_id stays null.
  name: z.string().max(200).optional(),
  unit_price_cents: z.number().int().nonnegative().optional(),
  billing_unit: z
    .enum(['per_video', 'per_post', 'per_month', 'per_year', 'per_quarter', 'flat', 'per_hour', 'per_unit'])
    .optional(),
  quantity: z.number().int().positive().default(1),
  unit_price_override_cents: z.number().int().nonnegative().optional(),
  note: z.string().max(500).optional(),
});

async function adminCheck(userId: string, admin: ReturnType<typeof createAdminClient>) {
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', userId)
    .single();
  return me?.role === 'admin' || me?.is_super_admin === true;
}

/** POST /api/admin/proposals/drafts/[id]/lines — append a service line. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: draftId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  if (!(await adminCheck(user.id, admin))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = AddLineBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'bad body' }, { status: 400 });
  }
  const body = parsed.data;

  const { data: draft } = await admin
    .from('proposal_drafts')
    .select('id, agency, service_lines')
    .eq('id', draftId)
    .maybeSingle();
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 });

  // Resolve the service. Catalog-backed if either id or slug is set;
  // free-form otherwise.
  let line: ServiceLine;
  if (body.service_id || body.service_slug) {
    let q = admin
      .from('proposal_services')
      .select('id, slug, name, billing_unit, base_unit_price_cents')
      .eq('agency', draft.agency)
      .eq('active', true);
    q = body.service_id ? q.eq('id', body.service_id) : q.eq('slug', body.service_slug as string);
    const { data: service } = await q.maybeSingle();
    if (!service) {
      return NextResponse.json({ error: 'service not found in catalog' }, { status: 404 });
    }
    line = {
      id: randomUUID(),
      service_id: service.id as string,
      service_slug_snapshot: service.slug as string,
      name_snapshot: service.name as string,
      quantity: body.quantity,
      unit_price_cents: body.unit_price_override_cents ?? (service.base_unit_price_cents as number),
      billing_unit_snapshot: service.billing_unit as never,
      applied_rule_ids: [],
      note: body.note,
    };
  } else {
    if (!body.name || body.unit_price_cents === undefined || !body.billing_unit) {
      return NextResponse.json(
        { error: 'free-form lines require name + unit_price_cents + billing_unit' },
        { status: 400 },
      );
    }
    line = {
      id: randomUUID(),
      service_id: null,
      service_slug_snapshot: null,
      name_snapshot: body.name,
      quantity: body.quantity,
      unit_price_cents: body.unit_price_override_cents ?? body.unit_price_cents,
      billing_unit_snapshot: body.billing_unit,
      applied_rule_ids: [],
      note: body.note,
    };
  }

  const next = ([...((draft.service_lines as ServiceLine[]) ?? []), line]);
  await admin.from('proposal_drafts').update({ service_lines: next }).eq('id', draftId);

  const r = await persistRecomputedDraft(draftId, admin);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true, draft: r.draft, line_id: line.id });
}

const PatchLineBody = z.object({
  line_id: z.string().uuid(),
  quantity: z.number().int().positive().optional(),
  unit_price_cents: z.number().int().nonnegative().optional(),
  note: z.string().max(500).nullable().optional(),
  remove: z.boolean().optional(),
});

/** PATCH /api/admin/proposals/drafts/[id]/lines — mutate or remove a line. */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: draftId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  if (!(await adminCheck(user.id, admin))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = PatchLineBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'bad body' }, { status: 400 });
  }

  const { data: draft } = await admin
    .from('proposal_drafts')
    .select('id, service_lines')
    .eq('id', draftId)
    .maybeSingle();
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 });

  let lines = ((draft.service_lines as ServiceLine[]) ?? []);
  if (parsed.data.remove) {
    lines = lines.filter((l) => l.id !== parsed.data.line_id);
  } else {
    lines = lines.map((l) => {
      if (l.id !== parsed.data.line_id) return l;
      return {
        ...l,
        quantity: parsed.data.quantity ?? l.quantity,
        unit_price_cents: parsed.data.unit_price_cents ?? l.unit_price_cents,
        note: parsed.data.note === undefined ? l.note : parsed.data.note ?? undefined,
      };
    });
  }
  await admin.from('proposal_drafts').update({ service_lines: lines }).eq('id', draftId);
  const r = await persistRecomputedDraft(draftId, admin);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true, draft: r.draft });
}
