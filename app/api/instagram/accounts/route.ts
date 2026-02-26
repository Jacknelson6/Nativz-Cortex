/**
 * GET /api/instagram/accounts
 *
 * Discover Instagram Business Accounts linked to the Meta token.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isInstagramConfigured, getInstagramAccounts } from '@/lib/instagram/client';

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

    if (!isInstagramConfigured()) {
      return NextResponse.json({ error: 'Instagram not configured' }, { status: 503 });
    }

    const accounts = await getInstagramAccounts();
    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('GET /api/instagram/accounts error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch accounts' },
      { status: 500 }
    );
  }
}
