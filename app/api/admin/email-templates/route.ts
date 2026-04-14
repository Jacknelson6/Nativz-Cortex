import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

const CategoryEnum = z.enum(['followup', 'reminder', 'calendar', 'welcome', 'general']);

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  category: CategoryEnum,
  subject: z.string().max(200).default(''),
  body_markdown: z.string().max(10000).default(''),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('email_templates')
    .select('id, name, category, subject, body_markdown, updated_at, created_by')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.warn('[email-templates] list failed:', error);
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 });
  }
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('email_templates')
    .insert({
      name: parsed.data.name,
      category: parsed.data.category,
      subject: parsed.data.subject,
      body_markdown: parsed.data.body_markdown,
      created_by: auth.user.id,
    })
    .select('id, name, category, subject, body_markdown, updated_at, created_by')
    .single();

  if (error || !data) {
    console.warn('[email-templates] create failed:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
  return NextResponse.json({ template: data }, { status: 201 });
}
