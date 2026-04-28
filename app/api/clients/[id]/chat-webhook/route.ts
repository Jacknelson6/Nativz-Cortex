import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isGoogleChatWebhook, postToGoogleChat } from '@/lib/chat/post-to-google-chat';

const bodySchema = z.object({
  webhook_url: z
    .string()
    .url()
    .refine(isGoogleChatWebhook, { message: 'Must be a Google Chat webhook URL (https://chat.googleapis.com/...)' }),
});

/**
 * POST /api/clients/[id]/chat-webhook
 *
 * Save a Google Chat incoming-webhook URL on a client record. Sends a test
 * "connected" message to verify the URL works before persisting.
 *
 * @auth Required (admin)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: userData } = await admin.from('users').select('role').eq('id', user.id).single();
    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id: clientId } = await params;
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { data: client } = await admin
      .from('clients')
      .select('name')
      .eq('id', clientId)
      .single<{ name: string }>();

    try {
      await postToGoogleChat(parsed.data.webhook_url, {
        text: `✅ Cortex connected: ${client?.name ?? 'this client'}'s notifications will post here.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Webhook test failed';
      return NextResponse.json({ error: message }, { status: 422 });
    }

    const { error: updateError } = await admin
      .from('clients')
      .update({ chat_webhook_url: parsed.data.webhook_url })
      .eq('id', clientId);
    if (updateError) {
      return NextResponse.json({ error: 'Failed to save webhook' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/clients/[id]/chat-webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/clients/[id]/chat-webhook
 *
 * Disconnect the Google Chat webhook for a client.
 *
 * @auth Required (admin)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: userData } = await admin.from('users').select('role').eq('id', user.id).single();
    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id: clientId } = await params;
    const { error: updateError } = await admin
      .from('clients')
      .update({ chat_webhook_url: null })
      .eq('id', clientId);
    if (updateError) {
      return NextResponse.json({ error: 'Failed to remove webhook' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/clients/[id]/chat-webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
