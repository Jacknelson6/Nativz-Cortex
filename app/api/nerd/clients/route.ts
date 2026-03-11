import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
