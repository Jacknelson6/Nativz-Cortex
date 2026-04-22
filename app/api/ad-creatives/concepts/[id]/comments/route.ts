import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const postSchema = z.object({
  body: z.string().min(1).max(4000),
  kind: z.enum(['comment', 'approval', 'rejection']).default('comment'),
});

async function adminClientOrError() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin, full_name, email')
    .eq('id', user.id)
    .single();
  const isAdmin =
    me?.is_super_admin === true ||
    me?.role === 'admin' ||
    me?.role === 'super_admin';
  if (!isAdmin) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { admin, user, profile: me };
}

/**
 * List comments on a concept. Admin-scoped — the shared page joins its
 * own comment read into the concept payload.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await adminClientOrError();
  if ('error' in ctx) return ctx.error;

  const { id } = await params;
  const { data, error } = await ctx.admin
    .from('ad_concept_comments')
    .select('id, concept_id, author_name, body, kind, share_token_id, resolved_at, resolved_by, created_at')
    .eq('concept_id', id)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data ?? [] });
}

/**
 * Admin leaves an internal comment on a concept (a revision note to
 * self, "rendered for client review", etc.). Separate from the public
 * share-link comment route.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await adminClientOrError();
  if ('error' in ctx) return ctx.error;

  const { id } = await params;
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const authorName = ctx.profile?.full_name ?? ctx.profile?.email ?? 'Admin';

  const { data: inserted, error } = await ctx.admin
    .from('ad_concept_comments')
    .insert({
      concept_id: id,
      author_user_id: ctx.user.id,
      author_name: authorName,
      body: parsed.data.body.trim(),
      kind: parsed.data.kind,
    })
    .select('id, concept_id, author_name, body, kind, share_token_id, resolved_at, resolved_by, created_at')
    .single();
  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }
  return NextResponse.json({ comment: inserted }, { status: 201 });
}
