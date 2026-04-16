import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { searchCompetitorSocialsInteractive } from '@/lib/audit/search-competitor-socials';
import type { AuditPlatform } from '@/lib/audit/types';

export const maxDuration = 120;

const Schema = z.object({
  competitors: z.array(z.object({
    name: z.string().min(1),
    website: z.string().min(1),
  })).min(1).max(5),
  platforms: z.array(z.enum(['tiktok', 'instagram', 'youtube'])).min(1),
});

/**
 * POST /api/analyze-social/[id]/find-competitor-socials
 *
 * Searches each platform for each competitor's social profile. Returns
 * candidates with similarity scores so the confirm-platforms UI can show
 * disambiguation pickers for ambiguous matches. Runs TT + IG + YT in
 * parallel per competitor, competitors in parallel.
 *
 * Admin-only (audit is admin-only).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('users').select('role').eq('id', user.id).single();
  if (!me || !['admin', 'super_admin'].includes(me.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { data: audit } = await admin.from('prospect_audits').select('id').eq('id', id).single();
  if (!audit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const { competitors, platforms } = parsed.data;
  const results = await Promise.all(
    competitors.map((c) =>
      searchCompetitorSocialsInteractive(c.name, platforms as AuditPlatform[]),
    ),
  );

  return NextResponse.json({ results });
}
