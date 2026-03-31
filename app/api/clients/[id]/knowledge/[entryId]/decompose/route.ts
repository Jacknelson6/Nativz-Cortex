import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractMeetingDecompositionFromMarkdown } from '@/lib/knowledge/decomposer';
import { persistMeetingDecomposition } from '@/lib/knowledge/ingestion-pipeline';

/**
 * POST /api/clients/[id]/knowledge/[entryId]/decompose
 *
 * Re-run meeting decomposition for a `meeting` or `meeting_note` entry (creates
 * decision + action_item nodes and `produced` links). Idempotent-friendly: may
 * create duplicates if run repeatedly — prefer fresh meetings or dedupe in UI.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: userData } = await admin.from('users').select('role').eq('id', user.id).single();
    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id: clientId, entryId } = await params;

    const { data: entry, error } = await admin
      .from('client_knowledge_entries')
      .select('id, client_id, type, content')
      .eq('id', entryId)
      .eq('client_id', clientId)
      .single();

    if (error || !entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    if (entry.type !== 'meeting' && entry.type !== 'meeting_note') {
      return NextResponse.json(
        { error: 'Only meeting or meeting_note entries can be decomposed' },
        { status: 400 },
      );
    }

    const payload = await extractMeetingDecompositionFromMarkdown(entry.content ?? '');
    const { decisionIds, actionIds } = await persistMeetingDecomposition(
      clientId,
      entryId,
      payload,
      user.id,
    );

    return NextResponse.json({
      decisions_created: decisionIds.length,
      action_items_created: actionIds.length,
    });
  } catch (e) {
    console.error('POST decompose error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
