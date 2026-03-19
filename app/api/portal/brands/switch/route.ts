/**
 * POST /api/portal/brands/switch
 *
 * Switches the active brand/client for the portal user by setting
 * a cookie. Validates the user has access to the requested client.
 *
 * @auth Required (viewer or admin)
 * @body client_id - UUID of the client to switch to
 * @returns {{ success: true, client: { id, name, slug, agency } }}
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const switchSchema = z.object({
  client_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = switchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid client_id' }, { status: 400 });
    }

    const { client_id } = parsed.data;
    const adminClient = createAdminClient();

    // Verify user has access to this client
    const { data: access } = await adminClient
      .from('user_client_access')
      .select('id')
      .eq('user_id', user.id)
      .eq('client_id', client_id)
      .single();

    if (!access) {
      return NextResponse.json({ error: 'You do not have access to this brand' }, { status: 403 });
    }

    // Get client details
    const { data: client } = await adminClient
      .from('clients')
      .select('id, name, slug, agency, organization_id')
      .eq('id', client_id)
      .eq('is_active', true)
      .single();

    if (!client) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    // Set the active client cookie
    const cookieStore = await cookies();
    cookieStore.set('x-portal-active-client', client_id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return NextResponse.json({
      success: true,
      client: {
        id: client.id,
        name: client.name,
        slug: client.slug,
        agency: client.agency ?? null,
      },
    });
  } catch (error) {
    console.error('POST /api/portal/brands/switch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
