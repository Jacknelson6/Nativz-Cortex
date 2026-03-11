import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const bodySchema = z.object({
  clientId: z.string().uuid(),
  dateRange: z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  sections: z.object({
    performanceSummary: z.boolean(),
    platformBreakdown: z.boolean(),
    topPosts: z.boolean(),
    topPostsCount: z.number().int().min(1).max(50),
  }),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { clientId, dateRange, sections } = parsed.data;
    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30-day expiry

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('report_links')
      .insert({
        client_id: clientId,
        token,
        date_start: dateRange.start,
        date_end: dateRange.end,
        sections,
        expires_at: expiresAt.toISOString(),
        created_by: user.id,
      })
      .select('id, token')
      .single();

    if (error) {
      console.error('Failed to create report link:', error);
      return NextResponse.json(
        { error: 'Failed to create share link' },
        { status: 500 },
      );
    }

    const origin = new URL(request.url).origin;
    const url = `${origin}/shared/report/${data.token}`;

    return NextResponse.json({ id: data.id, token: data.token, url });
  } catch (error) {
    console.error('POST /api/reporting/share error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
