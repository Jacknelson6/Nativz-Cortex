import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

const CreateSchema = z.object({
  email: z.string().email(),
  full_name: z.string().optional().nullable(),
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.trim() ?? '';
  const role = searchParams.get('role') ?? 'all';
  const emailFilter = searchParams.get('email') ?? 'all';
  const limit = Math.min(Number(searchParams.get('limit') ?? 500), 1000);

  const admin = createAdminClient();
  let query = admin
    .from('email_contacts')
    .select(`
      id, email, full_name, first_name, last_name, title, company, role,
      client_id, user_id, tags, subscribed, unsubscribed_at, bounced_at,
      complained_at, notes, created_at, updated_at,
      client:client_id ( id, name, agency )
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (search) {
    query = query.or(
      `email.ilike.%${search}%,full_name.ilike.%${search}%,company.ilike.%${search}%`,
    );
  }
  if (role !== 'all') query = query.eq('role', role);
  if (emailFilter === 'subscribed') query = query.eq('subscribed', true);
  if (emailFilter === 'unsubscribed') query = query.eq('subscribed', false);

  const { data, error } = await query;
  if (error) {
    console.warn('[email-hub/contacts] list failed:', error);
    return NextResponse.json({ error: 'Failed to load contacts' }, { status: 500 });
  }
  return NextResponse.json({ contacts: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const email = parsed.data.email.toLowerCase().trim();

  const { data: existing } = await admin
    .from('email_contacts')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: 'A contact with this email already exists', contactId: existing.id },
      { status: 409 },
    );
  }

  const full = parsed.data.full_name?.trim() || null;
  const first =
    parsed.data.first_name?.trim() || (full ? full.split(/\s+/)[0] ?? null : null);
  const last =
    parsed.data.last_name?.trim() ||
    (full ? full.split(/\s+/).slice(1).join(' ') || null : null);

  const { data, error } = await admin
    .from('email_contacts')
    .insert({
      email,
      full_name: full,
      first_name: first,
      last_name: last,
      title: parsed.data.title ?? null,
      company: parsed.data.company ?? null,
      role: parsed.data.role ?? null,
      client_id: parsed.data.client_id ?? null,
      notes: parsed.data.notes ?? null,
      tags: parsed.data.tags ?? [],
      created_by: auth.user.id,
    })
    .select('*')
    .single();

  if (error || !data) {
    console.warn('[email-hub/contacts] create failed:', error);
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
  }

  return NextResponse.json({ contact: data }, { status: 201 });
}
