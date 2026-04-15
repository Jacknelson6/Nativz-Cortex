import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveAccessContext } from '@/lib/portal/effective-access';

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

  // Artifact writes are admin-only. Impersonating admins are intentionally
  // downgraded to viewer by getEffectiveAccessContext, so they can't mint
  // artifacts for the impersonated client — they'd have to exit
  // impersonation first. That matches "see exactly what the client sees."
  const ctx = await getEffectiveAccessContext(user, admin);
  if (ctx.role !== 'admin') {
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
  const ctx = await getEffectiveAccessContext(user, admin);

  const url = new URL(request.url);
  const clientId = url.searchParams.get('client_id');
  const type = url.searchParams.get('type');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 100);

  let query = admin
    .from('nerd_artifacts')
    .select('id, client_id, conversation_id, title, artifact_type, created_at, created_by')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (ctx.role === 'viewer') {
    const scopedClientIds = ctx.clientIds ?? [];
    if (scopedClientIds.length === 0) {
      return NextResponse.json([]);
    }
    if (clientId && !scopedClientIds.includes(clientId)) {
      return NextResponse.json([]);
    }
    query = clientId ? query.eq('client_id', clientId) : query.in('client_id', scopedClientIds);
  } else if (clientId) {
    query = query.eq('client_id', clientId);
  }

  if (type) query = query.eq('artifact_type', type);

  const { data, error } = await query;
  if (error) {
    console.error('Error listing artifacts:', error);
    return NextResponse.json({ error: 'Failed to list artifacts' }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
