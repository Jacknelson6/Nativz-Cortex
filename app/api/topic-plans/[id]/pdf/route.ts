/**
 * GET /api/topic-plans/[id]/pdf
 *
 * Stream a PDF rendering of a topic plan using @react-pdf/renderer.
 * Replaces the .docx route as the artifact download path — Word's DOCX
 * rendering was unreliable across Word versions and Google Docs imports;
 * the PDF path renders deterministically from the same plan_json.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { topicPlanSchema } from '@/lib/topic-plans/types';
import { TopicPlanPdf } from '@/components/topic-plans/topic-plan-pdf';
import { detectAgencyFromHostname } from '@/lib/agency/detect';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Detect which agency the request came from so the PDF wears the right
  // brand. x-forwarded-host wins behind Vercel's proxy; fall back to the
  // request URL hostname for local dev.
  const hostHeader =
    req.headers.get('x-forwarded-host') ??
    req.headers.get('host') ??
    new URL(req.url).hostname;
  const agency = detectAgencyFromHostname(hostHeader);

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

  const buffer = await renderToBuffer(
    TopicPlanPdf({ plan: parsedPlan.data, clientName, agency }),
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
