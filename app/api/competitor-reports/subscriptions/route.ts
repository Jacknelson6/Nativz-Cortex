import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { nextRunAt } from '@/lib/reporting/build-competitor-report';

export const dynamic = 'force-dynamic';

const CADENCES = ['weekly', 'biweekly', 'monthly'] as const;

const createSchema = z.object({
  client_id: z.string().uuid(),
  cadence: z.enum(CADENCES),
  recipients: z.array(z.string().email()).min(1).max(20),
  include_portal_users: z.boolean().optional().default(false),
  enabled: z.boolean().optional().default(true),
  start_at: z.string().datetime().optional(),
});

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('id, role, is_super_admin, organization_id')
    .eq('id', user.id)
    .single();

  const isAdmin = me?.role === 'admin' || me?.role === 'super_admin' || me?.is_super_admin;
  return { user, me, admin, isAdmin };
}

export async function GET(_req: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;

  const { admin, isAdmin, me } = ctx;
  let query = admin
    .from('competitor_report_subscriptions')
    .select(
      'id, client_id, organization_id, cadence, recipients, include_portal_users, enabled, last_run_at, next_run_at, created_at, updated_at, client:clients(name, agency, organization_id)',
    )
    .order('next_run_at', { ascending: true });

  if (!isAdmin) {
    if (!me?.organization_id) {
      return NextResponse.json({ subscriptions: [] });
    }
    query = query.eq('organization_id', me.organization_id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ subscriptions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return ctx.error;
  if (!ctx.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
  }

  const { admin, user } = ctx;

  const { data: client } = await admin
    .from('clients')
    .select('id, organization_id')
    .eq('id', parsed.data.client_id)
    .single();
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const firstRun = parsed.data.start_at ? new Date(parsed.data.start_at) : new Date();
  const next = nextRunAt(firstRun, parsed.data.cadence);

  const { data: created, error } = await admin
    .from('competitor_report_subscriptions')
    .insert({
      client_id: client.id,
      organization_id: client.organization_id,
      created_by: user!.id,
      cadence: parsed.data.cadence,
      recipients: parsed.data.recipients,
      include_portal_users: parsed.data.include_portal_users,
      enabled: parsed.data.enabled,
      next_run_at: next.toISOString(),
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscription: created }, { status: 201 });
}
