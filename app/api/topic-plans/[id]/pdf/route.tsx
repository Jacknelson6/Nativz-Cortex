/**
 * GET /api/topic-plans/[id]/pdf
 *
 * Renders a topic plan as a branded deliverable PDF. The plan_json is
 * mapped through mapTopicPlanToBranded → BrandedDeliverableDocument
 * with the agency theme resolved from the request hostname.
 */

export const runtime = 'nodejs';

import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { topicPlanSchema } from '@/lib/topic-plans/types';
import { detectAgencyFromHostname } from '@/lib/agency/detect';
import { getTheme } from '@/lib/branding';
import { BrandedDeliverableDocument } from '@/lib/pdf/branded';
import { mapTopicPlanToBranded } from '@/lib/pdf/branded/adapters';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const hostHeader =
    req.headers.get('x-forwarded-host') ??
    req.headers.get('host') ??
    new URL(req.url).hostname;
  const agencySlug = detectAgencyFromHostname(hostHeader);
  const theme = getTheme(agencySlug);

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, organization_id')
    .eq('id', user.id)
    .single();
  if (!me) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { data: row } = await admin
    .from('topic_plans')
    .select('id, title, organization_id, plan_json, clients(name)')
    .eq('id', id)
    .single();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (me.role !== 'admin' && row.organization_id !== me.organization_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsedPlan = topicPlanSchema.safeParse(row.plan_json);
  if (!parsedPlan.success) {
    console.error('Invalid plan_json for topic_plan', id, parsedPlan.error.flatten());
    return NextResponse.json({ error: 'Plan data is corrupted' }, { status: 500 });
  }

  const clientName = Array.isArray(row.clients)
    ? row.clients[0]?.name ?? 'Client'
    : (row.clients as { name: string } | null)?.name ?? 'Client';

  const data = mapTopicPlanToBranded(parsedPlan.data, clientName);

  const buffer = await renderToBuffer(
    <BrandedDeliverableDocument data={data} theme={theme} />,
  );

  const safeClient = clientName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'client';
  const safeTitle = row.title.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'topic_plan';
  const filename = `${safeClient}_${safeTitle}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
