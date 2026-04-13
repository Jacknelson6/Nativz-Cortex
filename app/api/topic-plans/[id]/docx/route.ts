/**
 * GET /api/topic-plans/[id]/docx
 *
 * Stream a .docx rendering of a topic plan. Regenerated each call from
 * plan_json, so improvements to the builder show up without migrations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildTopicPlanDocx } from '@/lib/topic-plans/docx-builder';
import { topicPlanSchema } from '@/lib/topic-plans/types';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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

  const buffer = await buildTopicPlanDocx(parsedPlan.data, clientName);

  const safeClient = clientName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'client';
  const safeTitle = row.title.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'topic_plan';
  const filename = `${safeClient}_${safeTitle}.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
