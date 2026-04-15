/**
 * GET /api/topic-plans/[id]
 *
 * Fetch a single topic plan. Admins see any plan; portal viewers only see
 * plans scoped to their organization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveAccessContext } from '@/lib/portal/effective-access';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const ctx = await getEffectiveAccessContext(user, admin);

  const { data: plan } = await admin
    .from('topic_plans')
    .select('id, title, subtitle, client_id, organization_id, plan_json, topic_search_ids, created_at, clients(name)')
    .eq('id', id)
    .single();

  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (ctx.role !== 'admin') {
    // Strict client-id match — orgs can host multiple brands, so
    // organization_id equivalence would leak sibling brands' plans.
    const planClientId = plan.client_id as string | null;
    const inScope = !!planClientId && (ctx.clientIds?.includes(planClientId) ?? false);
    if (!inScope) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const clientName = Array.isArray(plan.clients)
    ? plan.clients[0]?.name ?? null
    : (plan.clients as { name: string } | null)?.name ?? null;

  return NextResponse.json({
    id: plan.id,
    title: plan.title,
    subtitle: plan.subtitle,
    client_id: plan.client_id,
    client_name: clientName,
    plan: plan.plan_json,
    topic_search_ids: plan.topic_search_ids,
    created_at: plan.created_at,
    download_url: `/api/topic-plans/${plan.id}/docx`,
  });
}
