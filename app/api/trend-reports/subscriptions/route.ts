import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { nextTrendRunAt } from '@/lib/reporting/build-trend-report';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(120),
  topic_query: z.string().min(1).max(500),
  keywords: z.array(z.string().min(1)).max(20).optional().default([]),
  brand_names: z.array(z.string().min(1)).max(20).optional().default([]),
  platforms: z.array(z.string()).max(10).optional().default([]),
  cadence: z.enum(['weekly', 'biweekly', 'monthly']),
  recipients: z.array(z.string().email()).min(1).max(20),
  include_portal_users: z.boolean().optional().default(false),
  enabled: z.boolean().optional().default(true),
  start_at: z.string().datetime().optional(),
});

async function requireAuth() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
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
  const ctx = await requireAuth();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let query = ctx.admin
    .from('trend_report_subscriptions')
    .select(
      'id, client_id, organization_id, name, topic_query, keywords, brand_names, platforms, cadence, recipients, include_portal_users, enabled, last_run_at, next_run_at, created_at, updated_at, client:clients(name, agency)',
    )
    .order('next_run_at', { ascending: true });

  if (!ctx.isAdmin) {
    if (!ctx.me?.organization_id) return NextResponse.json({ subscriptions: [] });
    query = query.eq('organization_id', ctx.me.organization_id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscriptions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
  }

  const { admin, user } = ctx;

  let organizationId: string | null = null;
  if (parsed.data.client_id) {
    const { data: client } = await admin
      .from('clients')
      .select('id, organization_id')
      .eq('id', parsed.data.client_id)
      .single();
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    organizationId = client.organization_id;
  }

  const firstRun = parsed.data.start_at ? new Date(parsed.data.start_at) : new Date();
  const next = nextTrendRunAt(firstRun, parsed.data.cadence);

  const { data: created, error } = await admin
    .from('trend_report_subscriptions')
    .insert({
      client_id: parsed.data.client_id ?? null,
      organization_id: organizationId,
      created_by: user!.id,
      name: parsed.data.name,
      topic_query: parsed.data.topic_query,
      keywords: parsed.data.keywords,
      brand_names: parsed.data.brand_names,
      platforms: parsed.data.platforms,
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
