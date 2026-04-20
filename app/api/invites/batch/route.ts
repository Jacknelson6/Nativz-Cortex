/**
 * POST /api/invites/batch
 *
 * Create multiple portal invite tokens for a single client in one request.
 * Each invite is independent (its own token, its own URL). Used by the
 * admin "Invite users" modal when onboarding N client employees at once.
 *
 * @auth Required (admin)
 * @body client_id - Client UUID (required)
 * @body count - Number of invites to generate (1-50, default 1)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandFromAgency } from '@/lib/agency/use-agency-brand';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

const schema = z.object({
  client_id: z.string().uuid(),
  count: z.number().int().min(1).max(50).default(1),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { client_id, count } = parsed.data;

    const { data: client } = await adminClient
      .from('clients')
      .select('id, name, organization_id, agency')
      .eq('id', client_id)
      .single();

    if (!client || !client.organization_id) {
      return NextResponse.json({ error: 'Client not found or missing organization' }, { status: 404 });
    }

    const rowsToInsert = Array.from({ length: count }, () => ({
      client_id: client.id,
      organization_id: client.organization_id,
      created_by: user.id,
    }));

    const { data: invites, error } = await adminClient
      .from('invite_tokens')
      .insert(rowsToInsert)
      .select('token, expires_at');

    if (error) {
      console.error('Failed to create batch invites:', error);
      return NextResponse.json({ error: 'Failed to create invites' }, { status: 500 });
    }

    // Match the email/brand: AC-branded clients get AC-host invite URLs
    // regardless of which cortex host the admin is on.
    const baseUrl = getCortexAppUrl(getBrandFromAgency(client.agency));
    const enriched = (invites ?? []).map(inv => ({
      token: inv.token,
      invite_url: `${baseUrl}/portal/join/${inv.token}`,
      expires_at: inv.expires_at,
    }));

    return NextResponse.json({
      client_name: client.name,
      invites: enriched,
    });
  } catch (error) {
    console.error('POST /api/invites/batch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
