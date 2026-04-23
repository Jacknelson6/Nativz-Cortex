import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getPortalClient } from '@/lib/portal/get-portal-client';

// TODO: Define your Zod schema
const requestSchema = z.object({
  // example: z.string().min(1, 'Field is required'),
});

/**
 * POST /api/portal/TODO-path
 *
 * TODO: Describe what this endpoint does.
 *
 * @auth Required (portal user session)
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

    const result = await getPortalClient();
    if (!result) {
      return NextResponse.json({ error: 'No client found' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    // IMPORTANT: Always scope queries by client/org — never return data from other orgs
    // TODO: Your business logic here
    // const { data, error } = await adminClient
    //   .from('table')
    //   .select('*')
    //   .eq('client_id', result.client.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/portal/TODO-path error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
