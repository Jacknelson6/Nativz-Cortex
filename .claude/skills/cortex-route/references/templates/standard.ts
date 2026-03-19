import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Use createAdminClient() only if you need to bypass RLS
// import { createAdminClient } from '@/lib/supabase/admin';

// TODO: Define your Zod schema
const requestSchema = z.object({
  // example: z.string().min(1, 'Field is required'),
});

/**
 * POST /api/TODO-path
 *
 * TODO: Describe what this endpoint does.
 *
 * @auth Required (authenticated user)
 * @body TODO: Document request body fields
 * @returns TODO: Document response shape
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    // const { data, error } = await supabase
    //   .from('table')
    //   .select('*')
    //   .eq('user_id', user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/TODO-path error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
