import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const createClientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  industry: z.string().min(1, 'Industry is required'),
  organization_id: z.string().uuid().optional(),
  target_audience: z.string().nullable().optional(),
  brand_voice: z.string().nullable().optional(),
  topic_keywords: z.array(z.string()).optional(),
});

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if admin
    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single();

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (userData.role === 'admin') {
      // Admin sees all clients
      const { data: clients } = await adminClient
        .from('clients')
        .select('*')
        .order('name');
      return NextResponse.json(clients || []);
    }

    // Portal user sees only their org's clients
    const { data: clients } = await adminClient
      .from('clients')
      .select('*')
      .eq('organization_id', userData.organization_id)
      .eq('is_active', true)
      .order('name');

    return NextResponse.json(clients || []);
  } catch (error) {
    console.error('GET /api/clients error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can create clients
    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createClientSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data: client, error: insertError } = await adminClient
      .from('clients')
      .insert({
        ...parsed.data,
        organization_id: parsed.data.organization_id || userData.organization_id,
        feature_flags: { can_search: true, can_view_reports: true },
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating client:', insertError);
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'A client with this slug already exists.' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
    }

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    console.error('POST /api/clients error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
