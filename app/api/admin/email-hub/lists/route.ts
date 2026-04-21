import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('email_lists')
    .select(`
      id, name, description, tags, created_at, updated_at,
      members:email_list_members(count)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[email-hub/lists] list failed:', error);
    return NextResponse.json({ error: 'Failed to load lists' }, { status: 500 });
  }

  type ListRow = {
    id: string;
    name: string;
    description: string | null;
    tags: string[];
    created_at: string;
    updated_at: string;
    members: { count: number }[] | null;
  };
  const lists = ((data ?? []) as ListRow[]).map((l) => ({
    ...l,
    member_count: Array.isArray(l.members) ? l.members[0]?.count ?? 0 : 0,
  }));

  return NextResponse.json({ lists });
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
  const { data, error } = await admin
    .from('email_lists')
    .insert({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      tags: parsed.data.tags ?? [],
      created_by: auth.user.id,
    })
    .select('*')
    .single();

  if (error || !data) {
    console.warn('[email-hub/lists] create failed:', error);
    return NextResponse.json({ error: 'Failed to create list' }, { status: 500 });
  }

  return NextResponse.json({ list: data }, { status: 201 });
}
