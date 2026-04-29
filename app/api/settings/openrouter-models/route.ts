import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOpenRouterModels, type OpenRouterModel } from '@/lib/ai/openrouter-models';

export type { OpenRouterModel };

/**
 * GET /api/settings/openrouter-models
 *
 * Returns the cached OpenRouter catalog from the `openrouter_models` table
 * (refreshed twice monthly by /api/cron/refresh-openrouter-models). Falls
 * back to a single live fetch on cold cache.
 *
 * @auth Required (any authenticated user)
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const admin = createAdminClient();
    const { models, refreshedAt, source } = await getOpenRouterModels(admin);
    return NextResponse.json({ models, refreshedAt, source });
  } catch (err) {
    console.error('Failed to load OpenRouter catalog:', err);
    return NextResponse.json({ error: 'Failed to load catalog' }, { status: 502 });
  }
}
