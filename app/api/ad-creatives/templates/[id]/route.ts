import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const patchSchema = z.object({
  is_favorite: z.boolean(),
});

/**
 * GET /api/ad-creatives/templates/[id]
 *
 * Fetch a single Kandy template with full prompt_schema.
 *
 * @auth Required
 * @param id - Template UUID
 * @returns {{ template: KandyTemplate }}
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: template, error } = await admin
      .from('kandy_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error('GET /api/ad-creatives/templates/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/ad-creatives/templates/[id]
 *
 * Toggle favorite status on a Kandy template.
 *
 * @auth Required (admin)
 * @param id - Template UUID
 * @body is_favorite - Boolean favorite status
 * @returns {{ template: KandyTemplate }}
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: template, error } = await admin
      .from('kandy_templates')
      .update({ is_favorite: parsed.data.is_favorite })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !template) {
      return NextResponse.json({ error: 'Template not found or update failed' }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error('PATCH /api/ad-creatives/templates/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
