import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/uppromote/client';
import { syncClientAffiliates } from '@/lib/uppromote/sync';

const bodySchema = z.object({
  api_key: z.string().min(1, 'API key is required'),
});

/**
 * POST /api/clients/[id]/uppromote
 *
 * Connect an UpPromote affiliate integration for a client. Validates the API key against
 * UpPromote, saves it to the client record, and triggers an initial non-blocking affiliate sync.
 *
 * @auth Required (admin)
 * @param id - Client UUID
 * @body api_key - UpPromote API key to validate and save (required)
 * @returns {{ success: true, message: string }}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: userData } = await admin.from('users').select('role').eq('id', user.id).single();
    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id: clientId } = await params;
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    // Validate the key against UpPromote
    const valid = await validateApiKey(parsed.data.api_key);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid UpPromote API key' }, { status: 422 });
    }

    // Save to client record
    const { error: updateError } = await admin
      .from('clients')
      .update({ uppromote_api_key: parsed.data.api_key })
      .eq('id', clientId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 });
    }

    // Trigger initial sync (non-blocking)
    syncClientAffiliates(clientId, parsed.data.api_key).catch((err) =>
      console.error('[uppromote] Initial sync failed:', err),
    );

    return NextResponse.json({ success: true, message: 'API key saved and sync started' });
  } catch (error) {
    console.error('POST /api/clients/[id]/uppromote error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/clients/[id]/uppromote
 *
 * Disconnect the UpPromote integration for a client by clearing the stored API key.
 *
 * @auth Required (admin)
 * @param id - Client UUID
 * @returns {{ success: true }}
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: userData } = await admin.from('users').select('role').eq('id', user.id).single();
    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id: clientId } = await params;

    const { error: updateError } = await admin
      .from('clients')
      .update({
        uppromote_api_key: null,
        affiliate_digest_email_enabled: false,
        affiliate_digest_recipients: null,
      })
      .eq('id', clientId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to remove API key' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/clients/[id]/uppromote error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
