import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADVERTISING_TYPES } from '@/lib/ad-creatives/types';
import {
  getClientAdGenerationSettings,
  upsertClientAdGenerationSettingsRow,
} from '@/lib/ad-creatives/client-ad-generation-settings';

const patchSchema = z.object({
  advertising_type: z.enum(ADVERTISING_TYPES).optional(),
  image_prompt_modifier: z.string().max(4000).optional(),
});

/**
 * GET /api/clients/[id]/ad-generation-settings
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: client } = await admin.from('clients').select('id').eq('id', clientId).single();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const settings = await getClientAdGenerationSettings(clientId);
  return NextResponse.json(settings);
}

/**
 * PATCH /api/clients/[id]/ad-generation-settings
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.advertising_type === undefined && parsed.data.image_prompt_modifier === undefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: client } = await admin.from('clients').select('id').eq('id', clientId).single();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const cur = await getClientAdGenerationSettings(clientId);
  await upsertClientAdGenerationSettingsRow({
    clientId,
    advertising_type: parsed.data.advertising_type ?? cur.advertising_type,
    image_prompt_modifier: parsed.data.image_prompt_modifier ?? cur.image_prompt_modifier,
  });

  const next = await getClientAdGenerationSettings(clientId);
  return NextResponse.json(next);
}
