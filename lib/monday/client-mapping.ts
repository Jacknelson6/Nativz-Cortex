/**
 * Monday Content-Calendar item-name → Cortex client-slug map.
 *
 * The Monday board's row names are human-typed and don't carry an explicit
 * Cortex client_id, so we maintain this lookup alongside it. Generated on
 * 2026-04-27 against the board + active SMM clients; see
 * `scripts/queue-from-monday.ts` for the original.
 *
 * Single source of truth so the bulk script + the per-row Quick Schedule
 * route + any future automation all resolve clients identically.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SocialPlatform } from '@/lib/posting';

export const MONDAY_NAME_TO_CORTEX_SLUG: Record<string, string> = {
  'Coast to Coast': 'coast-to-coast',
  'Owings Auto': 'owings-auto',
  'Equidad Homes': 'equidad-homes',
  'Rana Furniture': 'rana-furniture',
  'All Shutters and Blinds': 'all-shutters-and-blinds',
  'Avondale Private Lending': 'avondale-private-lending',
  'Crystal Creek Cattle': 'crystal-creek-cattle',
  'Custom Shade and Shutter': 'custom-shade-and-shutter',
  'Goodier Labs': 'goodier-labs',
  "Dunston's Steakhouse": 'dunstons-steakhouse',
  'Fusion Brands': 'fusion-brands',
  'Hartley Law': 'hartley-law',
  'Skibell Fine Jewelry': 'skibell-fine-jewelry',
  'The Standard Ranch Water': 'the-standard-ranch-water',
  'Total Plumbing': 'total-plumbing',
  'Varsity Vault': 'varsity-vault',
  'Goldback': 'goldback',
  'Safe Stop': 'safe-stop',
  'National Lenders': 'national-lenders',
  'Rank Prompt': 'rank-prompt',
};

export interface ResolvedCortexClient {
  clientId: string;
  clientName: string;
  slug: string;
  agency: string | null;
  platforms: SocialPlatform[];
}

export type ResolveError =
  | { code: 'no_slug_mapping'; detail: string }
  | { code: 'client_not_found'; detail: string }
  | { code: 'client_inactive'; detail: string }
  | { code: 'no_smm_service'; detail: string }
  | { code: 'no_connected_platforms'; detail: string };

/**
 * Resolve a Monday item name → fully-validated Cortex client + the
 * social platforms we can publish to. Mirrors `buildPlan` in
 * `scripts/queue-from-monday.ts` so both code paths fail the same way
 * (and a fix to one is a fix to both).
 */
export async function resolveCortexClientFromMondayName(
  admin: SupabaseClient,
  itemName: string,
): Promise<{ ok: true; client: ResolvedCortexClient } | { ok: false; error: ResolveError }> {
  const slug = MONDAY_NAME_TO_CORTEX_SLUG[itemName];
  if (!slug) {
    return {
      ok: false,
      error: {
        code: 'no_slug_mapping',
        detail: `No Cortex slug mapping for Monday row "${itemName}". Add it to MONDAY_NAME_TO_CORTEX_SLUG.`,
      },
    };
  }

  const { data: client } = await admin
    .from('clients')
    .select('id, name, agency, services, is_active')
    .eq('slug', slug)
    .maybeSingle<{
      id: string;
      name: string;
      agency: string | null;
      services: string[] | null;
      is_active: boolean | null;
    }>();

  if (!client) {
    return {
      ok: false,
      error: { code: 'client_not_found', detail: `Cortex client not found for slug "${slug}".` },
    };
  }
  if (!client.is_active) {
    return {
      ok: false,
      error: { code: 'client_inactive', detail: `Cortex client "${client.name}" is inactive.` },
    };
  }
  if (!client.services?.includes('SMM')) {
    return {
      ok: false,
      error: {
        code: 'no_smm_service',
        detail: `Cortex client "${client.name}" doesn't have the SMM service enabled.`,
      },
    };
  }

  const { data: profiles } = await admin
    .from('social_profiles')
    .select('platform, late_account_id')
    .eq('client_id', client.id)
    .eq('is_active', true);

  const platforms = (profiles ?? [])
    .filter((p) => typeof p.late_account_id === 'string' && p.late_account_id.length > 0)
    .map((p) => p.platform as SocialPlatform);

  if (platforms.length === 0) {
    return {
      ok: false,
      error: {
        code: 'no_connected_platforms',
        detail: `"${client.name}" has no Zernio-connected social profiles. Connect at least one in Settings → Connections.`,
      },
    };
  }

  return {
    ok: true,
    client: {
      clientId: client.id,
      clientName: client.name,
      slug,
      agency: client.agency,
      platforms,
    },
  };
}
