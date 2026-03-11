import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

// GET: List pipeline items (optionally filtered by month)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const monthDate = searchParams.get('month'); // e.g. "2026-03-01"

    const adminClient = createAdminClient();
    let query = adminClient
      .from('content_pipeline')
      .select('*')
      .order('client_name', { ascending: true });

    if (monthDate) {
      query = query.eq('month_date', monthDate);
    } else {
      // Default: show current and next month
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      query = query.gte('month_date', currentMonth).order('month_date', { ascending: false });
    }

    const { data, error } = await query;
    if (error) {
      console.error('Pipeline list error:', error);
      return NextResponse.json({ error: 'Failed to load pipeline' }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    console.error('GET /api/pipeline error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Create a new pipeline item
const CreateSchema = z.object({
  client_id: z.string().uuid().optional(),
  client_name: z.string().min(1),
  month_label: z.string(),
  month_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  agency: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('content_pipeline')
      .insert(parsed.data)
      .select()
      .single();

    if (error) {
      console.error('Create pipeline error:', error);
      return NextResponse.json({ error: 'Failed to create pipeline item' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('POST /api/pipeline error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
