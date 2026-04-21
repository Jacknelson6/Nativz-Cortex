/**
 * PATCH  /api/admin/banners/[id] — update any banner field.
 * DELETE /api/admin/banners/[id] — hard-delete a banner.
 *
 * @auth Admin / super_admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 10;

const patchSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  description: z.string().max(2000).nullable().optional(),
  style: z.enum(['info', 'warning', 'success', 'error', 'event', 'promo']).optional(),
  icon: z.enum(['info', 'alert', 'calendar', 'sparkles', 'gift', 'check', 'bell']).optional(),
  link_url: z.string().url().max(2000).nullable().optional(),
  link_text: z.string().max(80).nullable().optional(),
  start_at: z.string().datetime().optional(),
  end_at: z.string().datetime().nullable().optional(),
  event_at: z.string().datetime().nullable().optional(),
  position: z.enum(['top', 'sidebar', 'modal']).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  target_agency: z.enum(['nativz', 'anderson']).nullable().optional(),
  target_role: z.enum(['admin', 'viewer']).nullable().optional(),
  target_client_id: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
  dismissible: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const raw = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.from('banners').update(parsed.data).eq('id', id);

  if (error) {
    console.error('[banners:update] failed:', error);
    return NextResponse.json({ error: 'Failed to update banner' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminClient();
  const { error } = await admin.from('banners').delete().eq('id', id);

  if (error) {
    console.error('[banners:delete] failed:', error);
    return NextResponse.json({ error: 'Failed to delete banner' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
