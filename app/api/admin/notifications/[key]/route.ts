import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getNotificationDefinition } from '@/lib/notifications/registry';
import { getNotificationSetting } from '@/lib/notifications/get-setting';

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { key } = await params;
  if (!getNotificationDefinition(key)) {
    return NextResponse.json({ error: 'unknown notification' }, { status: 404 });
  }
  const setting = await getNotificationSetting(key);
  return NextResponse.json(setting);
}

const PatchSchema = z.object({
  enabled: z.boolean().optional(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { key } = await params;
  const def = getNotificationDefinition(key);
  if (!def) {
    return NextResponse.json({ error: 'unknown notification' }, { status: 404 });
  }

  const body = PatchSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const { admin, user } = auth;
  const current = await getNotificationSetting(key);
  const nextEnabled = body.data.enabled ?? current.enabled;
  const mergedParams = { ...current.params, ...(body.data.params ?? {}) };

  const { error } = await admin
    .from('notification_settings')
    .upsert(
      {
        key,
        enabled: nextEnabled,
        params: mergedParams,
        updated_by: user.id,
      },
      { onConflict: 'key' },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ key, enabled: nextEnabled, params: mergedParams });
}
