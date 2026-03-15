import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiKey } from '@/lib/api-keys/validate';
import { createAdminClient } from '@/lib/supabase/admin';

const createTeamMemberSchema = z.object({
  full_name: z.string().min(1).max(200),
  email: z.string().email().optional().nullable(),
  role: z.string().max(100).optional().nullable(),
});

/**
 * GET /api/v1/team
 *
 * List all active team members, ordered alphabetically by name.
 *
 * @auth API key (Bearer token via Authorization header)
 * @returns {{ team: TeamMember[] }}
 */
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

/**
 * POST /api/v1/team
 *
 * Create a new team member record. Returns 409 if the email already exists.
 *
 * @auth API key (Bearer token via Authorization header)
 * @body full_name - Full name, max 200 chars (required)
 * @body email - Email address (optional)
 * @body role - Role/title, max 100 chars (optional)
 * @returns {{ member: TeamMember }}
 */
export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
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
