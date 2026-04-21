/**
 * GET  /api/admin/banners — list every banner (active and inactive) for the admin composer.
 * POST /api/admin/banners — create a new banner.
 *
 * @auth Admin / super_admin only. Viewers hit /api/banners/active instead.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 10;

const BANNER_STYLES = ['info', 'warning', 'success', 'error', 'event', 'promo'] as const;
const BANNER_ICONS = ['info', 'alert', 'calendar', 'sparkles', 'gift', 'check', 'bell'] as const;
const BANNER_POSITIONS = ['top', 'sidebar', 'modal'] as const;

const bannerSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(2000).nullable().optional(),
  style: z.enum(BANNER_STYLES).default('info'),
  icon: z.enum(BANNER_ICONS).default('info'),
  link_url: z.string().url().max(2000).nullable().optional(),
  link_text: z.string().max(80).nullable().optional(),
  start_at: z.string().datetime().optional(),
  end_at: z.string().datetime().nullable().optional(),
  event_at: z.string().datetime().nullable().optional(),
  position: z.enum(BANNER_POSITIONS).default('top'),
  priority: z.number().int().min(0).max(1000).default(0),
  target_agency: z.enum(['nativz', 'anderson']).nullable().optional(),
  target_role: z.enum(['admin', 'viewer']).nullable().optional(),
  target_client_id: z.string().uuid().nullable().optional(),
  active: z.boolean().default(true),
  dismissible: z.boolean().default(true),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('banners')
    .select(
      'id, title, description, style, icon, link_url, link_text, start_at, end_at, event_at, position, priority, target_agency, target_role, target_client_id, active, dismissible, created_by, created_at, updated_at',
    )
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[banners:list] failed:', error);
    return NextResponse.json({ error: 'Failed to list banners' }, { status: 500 });
  }

  return NextResponse.json({ banners: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const raw = await request.json().catch(() => ({}));
  const parsed = bannerSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('banners')
    .insert({ ...parsed.data, created_by: auth.user.id })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[banners:create] failed:', error);
    return NextResponse.json({ error: 'Failed to create banner' }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
