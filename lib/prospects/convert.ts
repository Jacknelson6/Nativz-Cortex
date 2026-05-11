// SPY-07: prospect to client conversion orchestrator. Single entry-point
// that wraps the multi-table choreography: organization (or merge), client
// row with the back-pointer, invite token, monitor auto-pause, activity log,
// best-effort push. Returns the new IDs + the invite URL the modal copies
// to clipboard.

import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/activity';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

export interface ConvertProspectInput {
  prospectId: string;
  actorUserId: string;
  body: {
    org_name: string;
    contact_email: string;
    contact_name: string;
    tier: string;
    strategist_user_id: string;
    notes?: string;
    merge_into_org_id?: string;
  };
}

export interface ConvertProspectResult {
  client_id: string;
  organization_id: string;
  invite_token: string;
  invite_url: string;
}

export class ConvertProspectError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ConvertProspectError';
    this.status = status;
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function ensureUniqueSlug(
  admin: ReturnType<typeof createAdminClient>,
  table: 'clients' | 'organizations',
  base: string,
): Promise<string> {
  const stem = slugify(base) || 'brand';
  let candidate = stem;
  for (let i = 0; i < 25; i += 1) {
    const { data } = await admin.from(table).select('id').eq('slug', candidate).maybeSingle();
    if (!data) return candidate;
    candidate = `${stem}-${i + 2}`;
  }
  // Last resort: timestamp suffix.
  return `${stem}-${Date.now().toString(36)}`;
}

export async function convertProspect(input: ConvertProspectInput): Promise<ConvertProspectResult> {
  const admin = createAdminClient();
  const { prospectId, actorUserId, body } = input;

  const { data: prospect, error: prospectErr } = await admin
    .from('prospects')
    .select('id, brand_name, website_url, niche, converted_to_client_id, archived_at, owner_user_id')
    .eq('id', prospectId)
    .maybeSingle();
  if (prospectErr) throw new ConvertProspectError(prospectErr.message, 500);
  if (!prospect) throw new ConvertProspectError('Prospect not found', 404);
  if (prospect.converted_to_client_id) {
    throw new ConvertProspectError('Prospect already converted', 409);
  }

  // Validate tier (package_tiers is the canonical tier table; PRD's
  // "client_tiers" was an aspirational name).
  const { data: tier } = await admin
    .from('package_tiers')
    .select('id, slug, agency')
    .eq('slug', body.tier)
    .eq('is_active', true)
    .maybeSingle();
  if (!tier) throw new ConvertProspectError('Tier not found', 422);

  // Organization: merge into existing, or mint a new one.
  let organizationId: string;
  if (body.merge_into_org_id) {
    const { data: existingOrg } = await admin
      .from('organizations')
      .select('id')
      .eq('id', body.merge_into_org_id)
      .maybeSingle();
    if (!existingOrg) throw new ConvertProspectError('Target org not found', 404);
    organizationId = existingOrg.id;
  } else {
    const orgSlug = await ensureUniqueSlug(admin, 'organizations', body.org_name);
    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .insert({
        name: body.org_name,
        slug: orgSlug,
        type: 'client',
      })
      .select('id')
      .single();
    if (orgErr || !org) throw new ConvertProspectError(orgErr?.message ?? 'Org insert failed', 500);
    organizationId = org.id;
  }

  // Client row. industry is NOT NULL — fall back to niche, then 'general'.
  const clientSlug = await ensureUniqueSlug(admin, 'clients', body.org_name);
  const { data: client, error: clientErr } = await admin
    .from('clients')
    .insert({
      name: body.org_name,
      slug: clientSlug,
      industry: prospect.niche ?? 'general',
      website_url: prospect.website_url ?? null,
      organization_id: organizationId,
      agency: tier.agency,
      lifecycle_state: 'active',
      converted_from_prospect_id: prospect.id,
      default_strategist_id: body.strategist_user_id,
      onboarded_via: 'prospect_conversion',
    })
    .select('id, agency')
    .single();
  if (clientErr || !client) throw new ConvertProspectError(clientErr?.message ?? 'Client insert failed', 500);

  // user_client_access for strategist + sales rep + actor. The portal RLS
  // is keyed off this table, so the strategist needs a row to see the new
  // brand. Best-effort, dedupe via the UNIQUE(user_id, client_id) index.
  const accessRows = new Map<string, { user_id: string; client_id: string; organization_id: string; role: string }>();
  for (const uid of [body.strategist_user_id, prospect.owner_user_id, actorUserId].filter(Boolean) as string[]) {
    accessRows.set(uid, {
      user_id: uid,
      client_id: client.id,
      organization_id: organizationId,
      role: uid === body.strategist_user_id ? 'strategist' : 'admin',
    });
  }
  if (accessRows.size > 0) {
    await admin.from('user_client_access').upsert([...accessRows.values()], {
      onConflict: 'user_id,client_id',
      ignoreDuplicates: true,
    });
  }

  // Invite token for the primary client contact.
  const { data: invite, error: inviteErr } = await admin
    .from('invite_tokens')
    .insert({
      client_id: client.id,
      organization_id: organizationId,
      created_by: actorUserId,
      email: body.contact_email,
    })
    .select('token')
    .single();
  if (inviteErr || !invite) throw new ConvertProspectError(inviteErr?.message ?? 'Invite mint failed', 500);

  const baseUrl = getCortexAppUrl(getBrandFromAgency(client.agency ?? null));
  const inviteUrl = `${baseUrl}/s/${invite.token}`;

  // Flip prospect: archive + back-pointer + lifecycle state. Pause the
  // monitor (the orchestrator's a sales tool; once they sign, the strategist
  // re-enables manually if useful).
  await admin
    .from('prospects')
    .update({
      converted_to_client_id: client.id,
      archived_at: new Date().toISOString(),
      lifecycle_state: 'converted',
    })
    .eq('id', prospect.id);

  await admin
    .from('prospect_monitor_config')
    .update({ active: false, paused_at: new Date().toISOString() })
    .eq('prospect_id', prospect.id);

  // Activity log. entity_type CHECK constraint only allows the canonical
  // 5 types — use 'client' (the conversion's noun) and stash prospect_id
  // in metadata so the audit trail can be reconstructed.
  await logActivity(actorUserId, 'prospect_converted', 'client', client.id, {
    prospect_id: prospect.id,
    brand_name: prospect.brand_name,
    org_name: body.org_name,
    tier: body.tier,
    contact_email: body.contact_email,
    strategist_user_id: body.strategist_user_id,
    notes: body.notes ?? null,
    merged_into_existing_org: Boolean(body.merge_into_org_id),
  });

  // Best-effort push. SPY-10 will replace with a proper notification helper.
  const pushUrl = process.env.PUSH_NOTIFY_URL;
  if (pushUrl) {
    try {
      await fetch(pushUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New client',
          body: `${prospect.brand_name} just converted (${body.tier}).`,
          client_id: client.id,
        }),
      });
    } catch (err) {
      console.error('Convert push notify failed (non-blocking):', err);
    }
  }

  return {
    client_id: client.id,
    organization_id: organizationId,
    invite_token: invite.token,
    invite_url: inviteUrl,
  };
}

const UNDO_WINDOW_MS = 60 * 60 * 1000;

export async function undoConversion(prospectId: string, actorUserId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: prospect } = await admin
    .from('prospects')
    .select('id, converted_to_client_id, archived_at, lifecycle_state')
    .eq('id', prospectId)
    .maybeSingle();
  if (!prospect) throw new ConvertProspectError('Prospect not found', 404);
  if (!prospect.converted_to_client_id || !prospect.archived_at) {
    throw new ConvertProspectError('Nothing to undo', 404);
  }
  const ageMs = Date.now() - new Date(prospect.archived_at).getTime();
  if (ageMs > UNDO_WINDOW_MS) {
    throw new ConvertProspectError('Undo window expired', 410);
  }

  const clientId = prospect.converted_to_client_id;

  // SPY-07 hard rule from PRD edge cases: "Undo while invite has been
  // redeemed → block undo, surface 'invite already redeemed; contact
  // admin'." If the prospect's contact has already accepted the invite,
  // there's now a real human user_client_access row tied to the brand,
  // wiping it via cascade would silently revoke their access without a
  // signal. Force a 409 so the strategist deals with it explicitly.
  const { data: redeemed } = await admin
    .from('invite_tokens')
    .select('id')
    .eq('client_id', clientId)
    .not('used_at', 'is', null)
    .limit(1)
    .maybeSingle();
  if (redeemed) {
    throw new ConvertProspectError(
      'Invite already redeemed, contact admin to revoke access manually.',
      409,
    );
  }
  const { data: client } = await admin
    .from('clients')
    .select('id, organization_id')
    .eq('id', clientId)
    .maybeSingle();

  // Cascade: invite_tokens + user_client_access FK to clients(id) ON DELETE
  // CASCADE, so deleting the client deletes those rows automatically. Org is
  // shared across clients in the merge case, so only delete it if this was
  // the only client on it.
  await admin.from('clients').delete().eq('id', clientId);

  if (client?.organization_id) {
    const { count } = await admin
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', client.organization_id);
    if ((count ?? 0) === 0) {
      await admin.from('organizations').delete().eq('id', client.organization_id);
    }
  }

  await admin
    .from('prospects')
    .update({
      converted_to_client_id: null,
      archived_at: null,
      lifecycle_state: 'demo_scheduled',
    })
    .eq('id', prospect.id);

  // Monitor stays paused on undo — the strategist can flip it back on
  // explicitly; the conversion may have set false intentionally.

  await logActivity(actorUserId, 'prospect_conversion_undone', 'client', clientId, {
    prospect_id: prospect.id,
  });
}
