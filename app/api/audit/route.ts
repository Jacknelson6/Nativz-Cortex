import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

export const maxDuration = 60;

const StartAuditSchema = z.object({
  website_url: z.string().min(1, 'Website URL is required'),
  social_urls: z.record(z.string(), z.string()).optional(),
  tiktok_url: z.string().optional(),
});

/**
 * POST /api/audit — Start a new prospect audit
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = StartAuditSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Verify admin role
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data: audit, error } = await adminClient
      .from('prospect_audits')
      .insert({
        website_url: parsed.data.website_url,
        tiktok_url: parsed.data.tiktok_url ?? parsed.data.social_urls?.tiktok ?? '',
        social_urls: parsed.data.social_urls ?? {},
        status: 'pending',
        created_by: user.id,
      })
      .select()
      .single();

    if (error || !audit) {
      console.error('Create audit error:', error);
      return NextResponse.json({ error: 'Failed to create audit' }, { status: 500 });
    }

    return NextResponse.json({ id: audit.id });
  } catch (error) {
    console.error('POST /api/audit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/audit — List all audits
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: audits } = await adminClient
      .from('prospect_audits')
      .select('id, website_url, tiktok_url, status, created_at, prospect_data, scorecard')
      .order('created_at', { ascending: false })
      .limit(50);

    return NextResponse.json({ audits: audits ?? [] });
  } catch (error) {
    console.error('GET /api/audit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/audit — Delete an audit
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const auditId = new URL(request.url).searchParams.get('id');
    if (!auditId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    await adminClient.from('prospect_audits').delete().eq('id', auditId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/audit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
