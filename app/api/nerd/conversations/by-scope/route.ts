import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const BodySchema = z.object({
  scopeType: z.enum(['audit', 'tiktok_shop_search', 'topic_search']),
  scopeId: z.string().uuid(),
});

const ADMIN_ROLES = ['admin', 'super_admin'];

/**
 * POST /api/nerd/conversations/by-scope
 *
 * Resolves the per-user, per-analysis Nerd conversation for a drawer
 * chat. Each user has exactly one thread per (scopeType, scopeId); this
 * endpoint finds or creates it and returns `{ conversationId }`.
 *
 * Admin-only. Drawer surfaces aren't exposed to portal users yet.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: userData } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || !ADMIN_ROLES.includes(userData.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid body' },
        { status: 400 },
      );
    }

    const { scopeType, scopeId } = parsed.data;

    // Try to find an existing thread for this user × scope.
    const { data: existing } = await admin
      .from('nerd_conversations')
      .select('id')
      .eq('user_id', user.id)
      .eq('scope_type', scopeType)
      .eq('scope_id', scopeId)
      .maybeSingle();

    if (existing?.id) {
      return NextResponse.json({ conversationId: existing.id, created: false });
    }

    // Derive a reasonable title from the scope so the Strategy Lab
    // conversation picker shows something meaningful if the user later
    // promotes this drawer thread there.
    const title = await deriveScopeTitle(admin, scopeType, scopeId);

    const { data: created, error: insertError } = await admin
      .from('nerd_conversations')
      .insert({
        user_id: user.id,
        title,
        scope_type: scopeType,
        scope_id: scopeId,
      })
      .select('id')
      .single();

    if (insertError || !created) {
      console.error('[conversations/by-scope] insert failed:', insertError);
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
    }

    return NextResponse.json({ conversationId: created.id, created: true });
  } catch (error) {
    console.error('POST /api/nerd/conversations/by-scope error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function deriveScopeTitle(
  admin: AdminClient,
  scopeType: 'audit' | 'tiktok_shop_search' | 'topic_search',
  scopeId: string,
): Promise<string> {
  try {
    if (scopeType === 'topic_search') {
      const { data } = await admin.from('topic_searches').select('query').eq('id', scopeId).maybeSingle();
      if (data?.query) return `Topic · ${data.query}`;
    }
    if (scopeType === 'tiktok_shop_search') {
      const { data } = await admin.from('tiktok_shop_searches').select('query').eq('id', scopeId).maybeSingle();
      if (data?.query) return `TikTok Shop · ${data.query}`;
    }
    if (scopeType === 'audit') {
      const { data } = await admin
        .from('prospect_audits')
        .select('website_url, prospect_data')
        .eq('id', scopeId)
        .maybeSingle();
      const pd = data?.prospect_data as { websiteContext?: { title?: string | null } } | null;
      const label = pd?.websiteContext?.title?.trim() || data?.website_url || scopeId;
      return `Audit · ${label}`;
    }
  } catch {
    /* non-fatal */
  }
  return `${scopeType} · ${scopeId.slice(0, 8)}`;
}
