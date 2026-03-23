import { createAdminClient } from '@/lib/supabase/admin';
import type { AdvertisingType } from './types';
import { ADVERTISING_TYPES } from './types';

export type ClientAdGenerationSettingsRow = {
  client_id: string;
  advertising_type: AdvertisingType;
  image_prompt_modifier: string;
  updated_at: string;
};

function isAdvertisingType(v: string): v is AdvertisingType {
  return (ADVERTISING_TYPES as readonly string[]).includes(v);
}

/**
 * Load per-client ad generation settings; returns defaults when no row exists.
 */
export async function getClientAdGenerationSettings(
  clientId: string,
): Promise<{ advertising_type: AdvertisingType; image_prompt_modifier: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('client_ad_generation_settings')
    .select('advertising_type, image_prompt_modifier')
    .eq('client_id', clientId)
    .maybeSingle();

  if (error) {
    console.warn('[client-ad-generation-settings] read failed:', error.message);
    return { advertising_type: 'product_dtc', image_prompt_modifier: '' };
  }

  const at = data?.advertising_type;
  return {
    advertising_type: typeof at === 'string' && isAdvertisingType(at) ? at : 'product_dtc',
    image_prompt_modifier: typeof data?.image_prompt_modifier === 'string' ? data.image_prompt_modifier : '',
  };
}

export async function upsertClientAdGenerationSettingsRow(params: {
  clientId: string;
  advertising_type: AdvertisingType;
  image_prompt_modifier: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('client_ad_generation_settings')
    .upsert(
      {
        client_id: params.clientId,
        advertising_type: params.advertising_type,
        image_prompt_modifier: params.image_prompt_modifier,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id' },
    );

  if (error) {
    console.error('[client-ad-generation-settings] upsert failed:', error.message);
    throw new Error(error.message);
  }
}

/**
 * Upsert modifier after Brand DNA completes (preserves existing advertising_type).
 */
export async function upsertClientImagePromptModifier(params: {
  clientId: string;
  imagePromptModifier: string;
  advertisingType?: AdvertisingType;
}): Promise<void> {
  const cur = await getClientAdGenerationSettings(params.clientId);
  await upsertClientAdGenerationSettingsRow({
    clientId: params.clientId,
    advertising_type: params.advertisingType ?? cur.advertising_type,
    image_prompt_modifier: params.imagePromptModifier,
  });
}
