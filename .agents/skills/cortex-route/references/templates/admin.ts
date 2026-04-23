import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60; // Increase for AI/external service calls

// TODO: Define your Zod schema
const requestSchema = z.object({
  // example: z.string().min(1, 'Field is required'),
});

/**
 * POST /api/TODO-path/[id]
 *
 * TODO: Describe what this endpoint does.
 *
 * @auth Required (admin)
 * @param id - TODO: Describe the dynamic param
 * @body TODO: Document request body fields
 * @returns TODO: Document response shape
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    // TODO: Your business logic here
    // Use adminClient for queries that need to bypass RLS
    // const { data, error } = await adminClient
    //   .from('table')
    //   .select('*')
    //   .eq('id', id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/TODO-path/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
