import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin endpoints for team-availability scheduling events.
 *
 * POST  /api/scheduling/events     — create event + members
 * GET   /api/scheduling/events     — list events (filter by client_id or item_id)
 *
 * Auth: admin only. The public client-facing flow lives at /schedule/[token]
 * and uses the share_token UUID — never these endpoints.
 *
 * @auth Required (admin)
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MemberInput = z.object({
  user_id: z.string().regex(UUID_RE),
  email: z.string().email(),
  display_name: z.string().max(120).nullable().optional(),
  role_label: z.string().max(60).nullable().optional(),
  attendance: z.enum(['required', 'optional']).default('required'),
});

const CreateBody = z.object({
  name: z.string().min(2).max(160),
  duration_minutes: z.number().int().min(15).max(240).default(30),
  lookahead_days: z.number().int().min(1).max(60).default(14),
  working_start: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default('09:00'),
  working_end: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default('17:00'),
  timezone: z.string().min(2).max(80).default('America/New_York'),
  client_id: z.string().regex(UUID_RE).nullable().optional(),
  flow_id: z.string().regex(UUID_RE).nullable().optional(),
  item_id: z.string().regex(UUID_RE).nullable().optional(),
  members: z.array(MemberInput).min(1).max(20),
});

async function requireAdmin(): Promise<
  | { ok: true; admin: ReturnType<typeof createAdminClient>; userId: string }
  | { ok: false; res: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = row?.role === 'admin' || row?.is_super_admin === true;
  if (!isAdmin) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, admin, userId: user.id };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid body' },
      { status: 400 },
    );
  }
  const body = parsed.data;
  if (body.working_end <= body.working_start) {
    return NextResponse.json(
      { error: 'working_end must be after working_start' },
      { status: 400 },
    );
  }

  const { data: event, error: createErr } = await auth.admin
    .from('team_scheduling_events')
    .insert({
      name: body.name,
      duration_minutes: body.duration_minutes,
      lookahead_days: body.lookahead_days,
      working_start: body.working_start,
      working_end: body.working_end,
      timezone: body.timezone,
      client_id: body.client_id ?? null,
      flow_id: body.flow_id ?? null,
      item_id: body.item_id ?? null,
      created_by: auth.userId,
    })
    .select('id, share_token')
    .single();

  if (createErr || !event) {
    console.error('[scheduling:create] insert failed', createErr);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }

  const memberRows = body.members.map((m) => ({
    event_id: event.id,
    user_id: m.user_id,
    email: m.email,
    display_name: m.display_name ?? null,
    role_label: m.role_label ?? null,
    attendance: m.attendance,
  }));

  const { error: memErr } = await auth.admin
    .from('team_scheduling_event_members')
    .insert(memberRows);
  if (memErr) {
    console.error('[scheduling:create] members insert failed', memErr);
    // Roll back the event row so we don't orphan it.
    await auth.admin.from('team_scheduling_events').delete().eq('id', event.id);
    return NextResponse.json({ error: 'Failed to add members' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: event.id,
    share_token: event.share_token,
    share_url: `/schedule/${event.share_token}`,
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('client_id');
  const itemId = searchParams.get('item_id');
  const flowId = searchParams.get('flow_id');

  let q = auth.admin
    .from('team_scheduling_events')
    .select(
      'id, name, duration_minutes, lookahead_days, working_start, working_end, timezone, share_token, status, client_id, flow_id, item_id, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(50);
  if (clientId && UUID_RE.test(clientId)) q = q.eq('client_id', clientId);
  if (itemId && UUID_RE.test(itemId)) q = q.eq('item_id', itemId);
  if (flowId && UUID_RE.test(flowId)) q = q.eq('flow_id', flowId);

  const { data, error } = await q;
  if (error) {
    console.error('[scheduling:list] query failed', error);
    return NextResponse.json({ error: 'List failed' }, { status: 500 });
  }
  return NextResponse.json({ events: data ?? [] });
}
