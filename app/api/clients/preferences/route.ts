import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const preferencesSchema = z.object({
  client_id: z.string().uuid(),
  preferences: z.object({
    tone_keywords: z.array(z.string().max(100)).max(20).default([]),
    topics_lean_into: z.array(z.string().max(200)).max(30).default([]),
    topics_avoid: z.array(z.string().max(200)).max(30).default([]),
    competitor_accounts: z.array(z.string().max(200)).max(20).default([]),
    seasonal_priorities: z.array(z.string().max(200)).max(20).default([]),
  }),
});

/**
 * POST /api/clients/preferences
 *
 * Update a client's content preferences (tone, topics, competitors, seasonal priorities).
 * Portal users (viewers) can only update clients in their organization and only if the
 * client has the can_edit_preferences feature flag enabled.
 *
 * @auth Required (admin or viewer)
 * @body client_id - Client UUID (required)
 * @body preferences.tone_keywords - Array of tone descriptors (max 20)
 * @body preferences.topics_lean_into - Array of topics to emphasize (max 30)
 * @body preferences.topics_avoid - Array of topics to avoid (max 30)
 * @body preferences.competitor_accounts - Array of competitor account names (max 20)
 * @body preferences.seasonal_priorities - Array of seasonal content priorities (max 20)
 * @returns {{ success: true }}
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const { data: userData } = await adminClient
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single();

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = preferencesSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { client_id, preferences } = parsed.data;

    // If viewer, verify org scope and feature flag
    if (userData.role !== 'admin') {
      const { data: client } = await adminClient
        .from('clients')
        .select('organization_id, feature_flags')
        .eq('id', client_id)
        .single();

      if (!client || client.organization_id !== userData.organization_id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      const flags = (client.feature_flags as Record<string, boolean>) || {};
      if (!flags.can_edit_preferences) {
        return NextResponse.json({ error: 'Preference editing is not enabled for your account' }, { status: 403 });
      }
    }

    const { error: updateError } = await adminClient
      .from('clients')
      .update({
        preferences,
        updated_at: new Date().toISOString(),
      })
      .eq('id', client_id);

    if (updateError) {
      console.error('Error updating preferences:', updateError);
      return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/clients/preferences error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
