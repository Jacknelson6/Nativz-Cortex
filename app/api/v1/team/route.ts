import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiKey } from '@/lib/api-keys/validate';
import { createAdminClient } from '@/lib/supabase/admin';

const createTeamMemberSchema = z.object({
  full_name: z.string().min(1).max(200),
  email: z.string().email().optional().nullable(),
  role: z.string().max(100).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('team_members')
    .select('id, full_name, email, role, avatar_url, is_active, user_id')
    .eq('is_active', true)
    .order('full_name');

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 });
  }

  return NextResponse.json({ team: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const body = await request.json();
  const parsed = createTeamMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('team_members')
    .insert({
      full_name: parsed.data.full_name,
      email: parsed.data.email ?? null,
      role: parsed.data.role ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Team member already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create team member' }, { status: 500 });
  }

  return NextResponse.json({ member: data }, { status: 201 });
}
