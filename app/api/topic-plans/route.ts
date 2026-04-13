/**
 * POST /api/topic-plans
 *
 * Persist a TopicPlan produced by the Nerd's create_topic_plan tool.
 * The plan body is the source of truth; the .docx is generated on demand
 * from plan_json so we can iterate on the builder without back-filling.
 *
 * @auth Required (admin — portal users get read-only access via GET)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { topicPlanSchema } from '@/lib/topic-plans/types';
import { z } from 'zod';

const createSchema = z.object({
  title: z.string().min(2).max(200),
  subtitle: z.string().max(400).optional(),
  client_id: z.string().uuid(),
  plan: topicPlanSchema,
  topic_search_ids: z.array(z.string().uuid()).max(10).optional(),
  conversation_id: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { title, subtitle, client_id, plan, topic_search_ids, conversation_id } = parsed.data;

  const { data: client } = await admin
    .from('clients')
    .select('id, organization_id')
    .eq('id', client_id)
    .single();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const { data, error } = await admin
    .from('topic_plans')
    .insert({
      client_id: client.id,
      organization_id: client.organization_id,
      title,
      subtitle: subtitle ?? null,
      plan_json: plan,
      topic_search_ids: topic_search_ids ?? [],
      conversation_id: conversation_id ?? null,
      created_by: user.id,
    })
    .select('id, title, subtitle, created_at')
    .single();

  if (error) {
    console.error('Failed to create topic plan:', error);
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id,
    title: data.title,
    subtitle: data.subtitle,
    created_at: data.created_at,
    download_url: `/api/topic-plans/${data.id}/docx`,
  });
}
