import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ideaSubmissionSchema = z.object({
  client_id: z.string().uuid(),
  title: z.string().min(1, 'Title is required').max(300),
  description: z.string().max(2000).optional().nullable(),
  source_url: z.string().url().max(2000).optional().nullable().or(z.literal('')),
  category: z.enum(['trending', 'content_idea', 'request', 'other']).default('other'),
});

export async function GET(request: NextRequest) {
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

    const clientId = request.nextUrl.searchParams.get('client_id');

    let query = adminClient
      .from('idea_submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (userData.role !== 'admin') {
      // Portal users: scope to their org's clients
      const { data: clients } = await adminClient
        .from('clients')
        .select('id')
        .eq('organization_id', userData.organization_id)
        .eq('is_active', true);

      const clientIds = (clients || []).map((c) => c.id);
      if (clientIds.length === 0) {
        return NextResponse.json([]);
      }
      query = query.in('client_id', clientIds);
    } else if (clientId) {
      query = query.eq('client_id', clientId);
    }

    const { data: ideas, error } = await query.limit(100);

    if (error) {
      console.error('Error fetching ideas:', error);
      return NextResponse.json({ error: 'Failed to fetch ideas' }, { status: 500 });
    }

    return NextResponse.json(ideas || []);
  } catch (error) {
    console.error('GET /api/ideas error:', error);
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
    const parsed = ideaSubmissionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { client_id, title, description, source_url, category } = parsed.data;

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
      if (!flags.can_submit_ideas) {
        return NextResponse.json({ error: 'Idea submission is not enabled for your account' }, { status: 403 });
      }
    }

    const { data: idea, error: insertError } = await adminClient
      .from('idea_submissions')
      .insert({
        client_id,
        submitted_by: user.id,
        title,
        description: description || null,
        source_url: source_url || null,
        category,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting idea:', insertError);
      return NextResponse.json({ error: 'Failed to submit idea' }, { status: 500 });
    }

    return NextResponse.json(idea, { status: 201 });
  } catch (error) {
    console.error('POST /api/ideas error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
