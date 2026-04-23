/**
 * Ensure a Zernio profile exists for a client.
 *
 * Called from three surfaces:
 *   - Eager creation: POST /api/onboarding/trackers fires this non-blocking
 *     when a new real (non-template) tracker is created so the profile is
 *     ready before the client ever taps Connect on the public page.
 *   - Admin scheduler connect: POST /api/scheduler/connect
 *   - Public onboarding connect: POST /api/onboarding/public/connect
 *
 * Idempotent: if the client already has a `late_profile_id`, returns it
 * without a Zernio API round-trip. Stores the id on `clients.late_profile_id`
 * on first creation. Safe to call repeatedly.
 *
 * (Column is still named `late_profile_id` because the rename from "Late" to
 * "Zernio" hasn't swept the DB — keeps the schema stable.)
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getZernioApiBase, getZernioApiKey } from '@/lib/posting';

export async function ensureZernioProfile(
  admin: SupabaseClient,
  clientId: string,
  clientName: string,
): Promise<string> {
  const { data: client } = await admin
    .from('clients')
    .select('late_profile_id')
    .eq('id', clientId)
    .single();

  if (client?.late_profile_id) return client.late_profile_id as string;

  const res = await fetch(`${getZernioApiBase()}/profiles`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getZernioApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: clientName }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create Zernio profile: ${await res.text()}`);
  }
  const body = (await res.json()) as { profile?: { _id?: string; id?: string } };
  const profileId = body.profile?._id ?? body.profile?.id;
  if (!profileId) {
    throw new Error('Zernio create profile: missing profile id in response');
  }

  await admin.from('clients').update({ late_profile_id: profileId }).eq('id', clientId);
  return profileId;
}
