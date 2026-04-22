import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateShareToken } from '@/lib/ad-creatives/share-token';

const createSchema = z.object({
  clientId: z.string().uuid(),
  // Omit to share the full concept gallery for the client. Provide a
  // batch id to scope a link to one generation drop.
  batchId: z.string().uuid().optional(),
  label: z.string().max(120).optional(),
  // Days until expiry. Omit for no expiry. Capped at a year so stale
  // links don't linger indefinitely.
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
});

/**
 * Admin creates a share token for the current client's concept gallery.
 * Returns the opaque token string and the constructed public URL.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin =
    me?.is_super_admin === true ||
    me?.role === 'admin' ||
    me?.role === 'super_admin';
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  const { clientId, batchId, label, expiresInDays } = parsed.data;

  // Verify the batch (if provided) belongs to this client. Prevents
  // admins from stitching together mismatched share links.
  if (batchId) {
    const { data: batch } = await admin
      .from('ad_generation_batches')
      .select('id, client_id')
      .eq('id', batchId)
      .maybeSingle();
    if (!batch || batch.client_id !== clientId) {
      return NextResponse.json(
        { error: 'Batch not found for this client' },
        { status: 404 },
      );
    }
  }

  const token = generateShareToken();
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
    : null;

  const { data: row, error } = await admin
    .from('ad_concept_share_tokens')
    .insert({
      token,
      batch_id: batchId ?? null,
      client_id: clientId,
      label: label ?? null,
      expires_at: expiresAt,
      created_by: user.id,
    })
    .select('id, token, batch_id, client_id, label, expires_at, created_at')
    .single();

  if (error || !row) {
    return NextResponse.json(
      { error: error?.message ?? 'Failed to create share link' },
      { status: 500 },
    );
  }

  const origin = req.nextUrl.origin;
  return NextResponse.json({
    shareToken: row,
    url: `${origin}/shared/ad-creatives/${row.token}`,
  });
}

/**
 * List live share tokens for a client. Used by the admin Share tab to
 * show existing links and let admins revoke them.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin =
    me?.is_super_admin === true ||
    me?.role === 'admin' ||
    me?.role === 'super_admin';
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const clientId = req.nextUrl.searchParams.get('clientId');
  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('ad_concept_share_tokens')
    .select('id, token, batch_id, client_id, label, expires_at, revoked_at, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ shareTokens: data ?? [] });
}
