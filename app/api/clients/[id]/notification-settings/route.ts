import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getClientScopedNotifications,
  getNotificationDefinition,
  type NotificationChannel,
} from '@/lib/notifications/registry';

/**
 * Per-client notification toggles.
 *
 * GET   returns one record per (notification_key × channel) for every
 *       client-scoped notification in the registry, joined with the
 *       brand's per-channel overrides from `client_notification_settings`.
 *       Missing rows default to enabled=true so the UI shows a fresh
 *       brand as fully opted-in.
 *
 * PATCH upserts one (notification_key, channel) row for the brand. Body:
 *       { notificationKey, channel: 'chat' | 'email', enabled: boolean }.
 *
 * Auth: admin only.
 */

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthorized', status: 401 as const };
  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    return { error: 'forbidden', status: 403 as const };
  }
  return { user, admin };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Accept both UUID and slug since the settings page is keyed by slug.
async function resolveClientId(
  admin: ReturnType<typeof createAdminClient>,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const { data } = await admin
    .from('clients')
    .select('id')
    .eq('slug', idOrSlug)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

interface OverrideRow {
  notification_key: string;
  channel: NotificationChannel;
  enabled: boolean;
  updated_at: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await params;
  const clientId = await resolveClientId(auth.admin, id);
  if (!clientId) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const { data: overrides } = await auth.admin
    .from('client_notification_settings')
    .select('notification_key, channel, enabled, updated_at')
    .eq('client_id', clientId)
    .returns<OverrideRow[]>();

  const overrideMap = new Map<string, OverrideRow>();
  for (const row of overrides ?? []) {
    overrideMap.set(`${row.notification_key}|${row.channel}`, row);
  }

  // Project the full registry × supported channels matrix. Defaults to
  // enabled=true when the brand has no row for that (key, channel).
  const definitions = getClientScopedNotifications();
  const settings = definitions.flatMap((def) => {
    const channels: NotificationChannel[] = [];
    if (def.channels.chat) channels.push('chat');
    if (def.channels.email) channels.push('email');
    return channels.map((channel) => {
      const hit = overrideMap.get(`${def.key}|${channel}`);
      return {
        notificationKey: def.key,
        channel,
        enabled: hit ? hit.enabled : true,
        updatedAt: hit?.updated_at ?? null,
      };
    });
  });

  return NextResponse.json({ clientId, settings });
}

const PatchSchema = z.object({
  notificationKey: z.string().min(1).max(120),
  channel: z.enum(['chat', 'email']),
  enabled: z.boolean(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await params;
  const clientId = await resolveClientId(auth.admin, id);
  if (!clientId) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const body = PatchSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const def = getNotificationDefinition(body.data.notificationKey);
  if (!def) {
    return NextResponse.json(
      { error: 'unknown notification' },
      { status: 404 },
    );
  }
  if (!def.clientScoped) {
    return NextResponse.json(
      { error: 'notification is not client-scoped' },
      { status: 400 },
    );
  }
  if (!def.channels[body.data.channel]) {
    return NextResponse.json(
      { error: 'notification does not support that channel' },
      { status: 400 },
    );
  }

  const { error } = await auth.admin
    .from('client_notification_settings')
    .upsert(
      {
        client_id: clientId,
        notification_key: body.data.notificationKey,
        channel: body.data.channel,
        enabled: body.data.enabled,
        updated_by: auth.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,notification_key,channel' },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    notificationKey: body.data.notificationKey,
    channel: body.data.channel,
    enabled: body.data.enabled,
  });
}
