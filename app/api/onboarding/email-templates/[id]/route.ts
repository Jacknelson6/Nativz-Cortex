import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOnboardingAdmin } from '@/lib/onboarding/require-admin';

const PatchBody = z.object({
  service: z.string().trim().min(1).max(60).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  subject: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(10000).optional(),
  sort_order: z.number().int().min(0).optional(),
}).refine((b) => Object.keys(b).length > 0, { message: 'At least one field required' });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin } = gate;

    const parsed = PatchBody.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('onboarding_email_templates')
      .update(parsed.data)
      .eq('id', id)
      .select('id, service, name, subject, body, sort_order, created_at, updated_at')
      .single();

    if (error) {
      console.error('PATCH /api/onboarding/email-templates/[id] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ template: data });
  } catch (error) {
    console.error('PATCH /api/onboarding/email-templates/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin } = gate;

    const { error } = await admin.from('onboarding_email_templates').delete().eq('id', id);
    if (error) {
      console.error('DELETE /api/onboarding/email-templates/[id] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/onboarding/email-templates/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
