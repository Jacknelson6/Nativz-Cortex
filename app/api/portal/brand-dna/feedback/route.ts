import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createKnowledgeEntry } from '@/lib/knowledge/queries';
import { createNotification } from '@/lib/notifications/create';

const feedbackSchema = z.object({
  section: z.string().min(1),
  feedback: z.string().min(1).max(2000),
  flagged_incorrect: z.boolean().default(false),
});

/**
 * POST /api/portal/brand-dna/feedback
 *
 * Submit feedback on a Brand DNA section from the client portal.
 * Creates a notification for the admin team.
 *
 * @auth Required (portal user)
 * @body section - Section heading
 * @body feedback - Feedback text
 * @body flagged_incorrect - Whether the section is flagged as incorrect
 */
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get user name for feedback attribution
  const { data: userData } = await admin
    .from('users')
    .select('full_name')
    .eq('id', user.id)
    .single();

  // Resolve active client (respects brand switcher cookie)
  const cookieStore = await cookies();
  const activeClientId = cookieStore.get('x-portal-active-client')?.value;

  let clientId: string | null = null;

  if (activeClientId) {
    const { data: access } = await admin
      .from('user_client_access')
      .select('client_id')
      .eq('user_id', user.id)
      .eq('client_id', activeClientId)
      .maybeSingle();
    if (access) clientId = activeClientId;
  }

  if (!clientId) {
    const { data: firstAccess } = await admin
      .from('user_client_access')
      .select('client_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    clientId = firstAccess?.client_id ?? null;
  }

  if (!clientId) {
    return NextResponse.json({ error: 'No client found' }, { status: 404 });
  }

  const { data: client } = await admin
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .single();

  if (!client) {
    return NextResponse.json({ error: 'No client found' }, { status: 404 });
  }

  // Store feedback as a knowledge entry
  await createKnowledgeEntry({
    client_id: client.id,
    type: 'note',
    title: `Portal feedback: ${parsed.data.section}${parsed.data.flagged_incorrect ? ' (flagged incorrect)' : ''}`,
    content: parsed.data.feedback,
    metadata: {
      source: 'portal_feedback',
      section: parsed.data.section,
      flagged_incorrect: parsed.data.flagged_incorrect,
      submitted_by: userData?.full_name ?? user.email ?? user.id,
    },
    source: 'manual',
    created_by: user.id,
  });

  // Notify all admin users
  const { data: admins } = await admin
    .from('users')
    .select('id')
    .eq('role', 'admin');

  const notifTitle = parsed.data.flagged_incorrect
    ? `${client.name} flagged Brand DNA section as incorrect`
    : `${client.name} left feedback on Brand DNA`;

  for (const a of admins ?? []) {
    createNotification({
      recipientUserId: a.id,
      type: 'general',
      title: notifTitle,
      body: `Section: ${parsed.data.section} — "${parsed.data.feedback.slice(0, 100)}${parsed.data.feedback.length > 100 ? '...' : ''}"`,
      linkPath: `/admin/clients/${client.id}`,
    }).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
