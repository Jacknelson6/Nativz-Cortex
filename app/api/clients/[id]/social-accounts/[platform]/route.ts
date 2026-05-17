import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { upsertClientSocialAccount } from '@/lib/onboarding/api';

const ALLOWED_PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin', 'x'] as const;

const patchSchema = z.object({
  handle: z.string().trim().max(120).nullish(),
  connection_status: z.enum(['pending', 'connected', 'disconnected', 'error']).optional(),
  connected_via: z.enum(['zernio', 'manual', 'meta_business_suite']).optional(),
  external_account_id: z.string().trim().max(200).nullish(),
});

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const adminClient = createAdminClient();
  const { data: userData } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!userData || userData.role !== 'admin') return null;
  return user;
}

/**
 * PATCH /api/clients/[id]/social-accounts/[platform]
 *
 * Upsert a social account row for a client + platform. Used by the
 * /profile/integrations page so admins can connect or update a social
 * handle without going back through onboarding.
 *
 * @auth Required (admin)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; platform: string }> },
) {
  try {
    const { id: clientId, platform } = await params;
    if (!ALLOWED_PLATFORMS.includes(platform as (typeof ALLOWED_PLATFORMS)[number])) {
      return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 });
    }

    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const handle = parsed.data.handle?.replace(/^@+/, '').trim() || null;

    await upsertClientSocialAccount({
      client_id: clientId,
      platform,
      handle,
      external_account_id: parsed.data.external_account_id ?? null,
      connection_status: parsed.data.connection_status ?? (handle ? 'connected' : 'pending'),
      connected_via: parsed.data.connected_via ?? 'manual',
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/clients/[id]/social-accounts/[platform] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/clients/[id]/social-accounts/[platform]
 *
 * Mark a social account as disconnected. Keeps the row so historical
 * metadata (external_account_id, connected_via) survives a reconnect.
 *
 * @auth Required (admin)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; platform: string }> },
) {
  try {
    const { id: clientId, platform } = await params;
    if (!ALLOWED_PLATFORMS.includes(platform as (typeof ALLOWED_PLATFORMS)[number])) {
      return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 });
    }

    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('client_social_accounts')
      .update({
        connection_status: 'disconnected',
        connected_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('client_id', clientId)
      .eq('platform', platform);

    if (error) {
      console.error('Error disconnecting social account:', error);
      return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/clients/[id]/social-accounts/[platform] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
