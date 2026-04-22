import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOnboardingAdmin } from '@/lib/onboarding/require-admin';

const CreateBody = z.object({
  service: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
});

/**
 * GET /api/onboarding/email-templates
 * Optional ?service= filter. Admin-only.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin } = gate;

    const service = new URL(request.url).searchParams.get('service');
    let query = admin
      .from('onboarding_email_templates')
      .select('id, service, name, subject, body, sort_order, created_at, updated_at')
      .order('service', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (service) query = query.eq('service', service);

    const { data, error } = await query;
    if (error) {
      console.error('GET /api/onboarding/email-templates error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ templates: data ?? [] });
  } catch (error) {
    console.error('GET /api/onboarding/email-templates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin, userId } = gate;

    const parsed = CreateBody.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
    }

    const { data: maxRow } = await admin
      .from('onboarding_email_templates')
      .select('sort_order')
      .eq('service', parsed.data.service)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSort = (maxRow?.sort_order ?? -1) + 1;

    const { data, error } = await admin
      .from('onboarding_email_templates')
      .insert({
        service: parsed.data.service,
        name: parsed.data.name,
        subject: parsed.data.subject,
        body: parsed.data.body,
        sort_order: nextSort,
        created_by: userId,
      })
      .select('id, service, name, subject, body, sort_order, created_at, updated_at')
      .single();

    if (error) {
      console.error('POST /api/onboarding/email-templates error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ template: data }, { status: 201 });
  } catch (error) {
    console.error('POST /api/onboarding/email-templates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
