import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { isGoogleChatWebhook } from '@/lib/chat/post-to-google-chat';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/connection-invites/context?clientId=
 *
 * Sidekick endpoint for the InviteBuilderModal. Returns the brand's
 * `contacts` rows (id / name / email / is_primary) so the admin can
 * pick recipients, plus a flag for whether `clients.chat_webhook_url`
 * is a real Google Chat webhook (drives whether the "ping the team
 * room" toggle is enabled).
 *
 * Auth: admin only.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const clientId = new URL(request.url).searchParams.get('clientId');
  if (!clientId) {
    return NextResponse.json({ error: 'clientId required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const [contactsRes, clientRes] = await Promise.all([
    admin
      .from('contacts')
      .select('id, name, email, is_primary')
      .eq('client_id', clientId)
      .not('email', 'is', null)
      .order('is_primary', { ascending: false })
      .order('name'),
    admin
      .from('clients')
      .select('chat_webhook_url')
      .eq('id', clientId)
      .maybeSingle(),
  ]);

  if (contactsRes.error) {
    return NextResponse.json(
      { error: 'db_error', detail: contactsRes.error.message },
      { status: 500 },
    );
  }

  const contacts = (contactsRes.data ?? [])
    .filter((c) => typeof c.email === 'string' && c.email.trim().length > 0)
    .map((c) => ({
      id: c.id as string,
      name: (c.name as string | null) ?? null,
      email: (c.email as string).trim(),
      isPrimary: c.is_primary === true,
    }));

  const hasChatWebhook = isGoogleChatWebhook(
    clientRes.data?.chat_webhook_url ?? null,
  );

  return NextResponse.json({ contacts, hasChatWebhook });
}
