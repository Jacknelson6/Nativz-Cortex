import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const createArtifactSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  conversation_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(256),
  content: z.string().min(1).max(500_000),
  artifact_type: z.enum(['script', 'plan', 'diagram', 'ideas', 'hook', 'strategy', 'general']).default('general'),
});

/** POST — save a new artifact */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const parsed = createArtifactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validation error' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify user is admin
  const { data: userData } = await admin.from('users').select('role').eq('id', user.id).single();
  if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { data, error } = await admin
    .from('nerd_artifacts')
    .insert({
      ...parsed.data,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving artifact:', error);
    return NextResponse.json({ error: 'Failed to save artifact' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

/** GET — list artifacts, optionally filtered by client_id */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: userData } = await admin.from('users').select('role, organization_id').eq('id', user.id).single();
  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const url = new URL(request.url);
  const clientId = url.searchParams.get('client_id');
  const type = url.searchParams.get('type');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 100);

  let query = admin
    .from('nerd_artifacts')
    .select('id, client_id, conversation_id, title, artifact_type, created_at, created_by')
    .order('created_at', { ascending: false })
    .limit(limit);

  // Scope portal users to their org — fetch their client IDs first
  if (userData.role === 'viewer' && userData.organization_id) {
    const { data: orgClients } = await admin
      .from('clients')
      .select('id')
      .eq('organization_id', userData.organization_id);
    const orgClientIds = (orgClients ?? []).map((c) => c.id);
    if (orgClientIds.length === 0) {
      return NextResponse.json([]);
    }
    query = query.in('client_id', orgClientIds);
  }

  if (clientId) query = query.eq('client_id', clientId);
  if (type) query = query.eq('artifact_type', type);

  const { data, error } = await query;
  if (error) {
    console.error('Error listing artifacts:', error);
    return NextResponse.json({ error: 'Failed to list artifacts' }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
