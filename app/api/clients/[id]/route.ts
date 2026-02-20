import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncClientProfileToVault } from '@/lib/vault/sync';

export async function PATCH(
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

    // Only admins can update clients
    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();

    // Only allow updating specific fields
    const allowedFields = [
      'industry',
      'target_audience',
      'brand_voice',
      'topic_keywords',
      'feature_flags',
      'is_active',
      'description',
      'category',
      'logo_url',
      'website_url',
      'preferences',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { data: client, error: updateError } = await adminClient
      .from('clients')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating client:', updateError);
      return NextResponse.json({ error: 'Failed to update client' }, { status: 500 });
    }

    // Sync client profile to Obsidian vault (non-blocking)
    if (client) {
      syncClientProfileToVault(client).catch(() => {});
    }

    return NextResponse.json(client);
  } catch (error) {
    console.error('PATCH /api/clients/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
