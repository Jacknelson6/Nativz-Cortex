import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMondayConfigured, fetchMondayClients, parseMondayClient } from '@/lib/monday/client';

export const maxDuration = 30;

let cachedData: any = null;
let cachedAt = 0;

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient.from('users').select('role').eq('id', user.id).single();
    if (!userData || userData.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    if (!isMondayConfigured()) return NextResponse.json({ error: 'Monday.com not configured' }, { status: 503 });

    if (cachedData && Date.now() - cachedAt < 5 * 60 * 1000) {
      return NextResponse.json(cachedData);
    }

    const items = await fetchMondayClients();
    const parsed = items.map(parseMondayClient);
    
    cachedData = parsed;
    cachedAt = Date.now();
    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
