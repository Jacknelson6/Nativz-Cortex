import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/nerd/clients
 *
 * List active clients for use by The Nerd AI assistant. Returns name, slug, and agency
 * for all active clients, ordered alphabetically.
 *
 * @auth Required (any authenticated user)
 * @returns {{ name: string, slug: string, agency: string | null }[]}
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: clients } = await admin
      .from('clients')
      .select('name, slug, agency')
      .eq('is_active', true)
      .order('name');

    return NextResponse.json(clients ?? []);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
  }
}
