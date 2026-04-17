import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import crypto from 'crypto';

/**
 * GET /api/analyze-social/[id]/share
 *
 * Check if an audit has an active share link and return its details.
 *
 * @auth Required (admin)
 * @param id - Prospect audit UUID
 * @returns {{ shared: false } | { shared: true, token: string, url: string, expires_at: string | null }}
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Verify audit exists
    const { data: audit } = await adminClient
      .from('prospect_audits')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    const { data: link } = await adminClient
      .from('audit_share_links')
      .select('id, token, expires_at, created_at')
      .eq('audit_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!link) {
      return NextResponse.json({ shared: false });
    }

    const baseUrl = request.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io';
    return NextResponse.json({
      shared: true,
      token: link.token,
      url: `${baseUrl}/shared/analyze-social/${link.token}`,
      expires_at: link.expires_at,
    });
  } catch (error) {
    console.error('GET /api/analyze-social/[id]/share error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/analyze-social/[id]/share
 *
 * Create a new public share link for a completed audit. Deletes any existing links
 * before generating a fresh 48-char hex token.
 *
 * @auth Required (admin)
 * @param id - Prospect audit UUID (must be in 'completed' status)
 * @returns {{ shared: true, token: string, url: string }}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Verify audit exists and is completed
    const { data: audit } = await adminClient
      .from('prospect_audits')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    if (audit.status !== 'completed') {
      return NextResponse.json({ error: 'Only completed audits can be shared' }, { status: 400 });
    }

    // Delete existing links
    await adminClient
      .from('audit_share_links')
      .delete()
      .eq('audit_id', id);

    const token = crypto.randomBytes(24).toString('hex');

    const { error: insertError } = await adminClient
      .from('audit_share_links')
      .insert({
        audit_id: id,
        token,
        created_by: user.id,
      });

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create share link' }, { status: 500 });
    }

    const baseUrl = request.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io';
    return NextResponse.json({
      shared: true,
      token,
      url: `${baseUrl}/shared/analyze-social/${token}`,
    });
  } catch (error) {
    console.error('POST /api/analyze-social/[id]/share error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/analyze-social/[id]/share
 *
 * Revoke the public share link for an audit by deleting all share records.
 *
 * @auth Required (admin)
 * @param id - Prospect audit UUID
 * @returns {{ shared: false }}
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Verify audit exists
    const { data: audit } = await adminClient
      .from('prospect_audits')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    await adminClient.from('audit_share_links').delete().eq('audit_id', id);

    return NextResponse.json({ shared: false });
  } catch (error) {
    console.error('DELETE /api/analyze-social/[id]/share error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
