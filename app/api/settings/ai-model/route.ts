import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const PatchSchema = z.object({
  model: z.string().min(1, 'Model name is required').max(200),
});

/**
 * GET /api/settings/ai-model
 *
 * Fetch the currently active AI model from agency_settings.
 *
 * @auth Required (admin)
 */
export async function GET() {
  try {
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

    const { data: settings } = await adminClient
      .from('agency_settings')
      .select('ai_model, updated_at')
      .eq('agency', 'nativz')
      .single();

    return NextResponse.json({
      model: settings?.ai_model ?? 'anthropic/claude-3.5-haiku',
      updatedAt: settings?.updated_at ?? null,
    });
  } catch (err) {
    console.error('GET /api/settings/ai-model error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/settings/ai-model
 *
 * Update the platform-wide AI model.
 *
 * @auth Required (admin)
 * @body { model: string }
 */
export async function PATCH(req: NextRequest) {
  try {
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

    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 },
      );
    }

    const { model } = parsed.data;

    const { error: updateError } = await adminClient
      .from('agency_settings')
      .update({ ai_model: model, updated_at: new Date().toISOString() })
      .eq('agency', 'nativz');

    if (updateError) {
      console.error('Failed to update ai_model:', updateError);
      return NextResponse.json({ error: 'Failed to save model' }, { status: 500 });
    }

    return NextResponse.json({ model, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('PATCH /api/settings/ai-model error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
